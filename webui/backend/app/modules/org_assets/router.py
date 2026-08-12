from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlmodel import select
from pathlib import Path
import mimetypes

from app.core.config import get_settings
from app.core.deps import CurrentUser, SessionDep, require_roles
from app.core.models import (
    AssetSubmission,
    CommandShell,
    Guide,
    OrgOperationLog,
    OrgSettings,
    Profile,
    PushJob,
    Sensor,
    StageTask,
    User,
)
from app.domain.asset_submission import decide_submission, set_asset_status, submission_payload
from app.domain.bootstrap import bootstrap_org
from app.domain.hub_exporter import export_hub
from app.domain.guide_package import (
    content_disposition_inline,
    content_fallback_for_path,
    merge_package_file_list,
    package_files_json_dumps,
    write_single_package_file,
)
from app.domain.ref_skills import (
    normalize_ref_skills,
    parse_ref_skills_json,
    parse_ref_skills_raw,
    ref_skills_to_json,
)
from app.domain.org_oplog import write_org_log
from app.domain.org_task_shell import (
    assemble_from_bindings,
    delete_command_shell_if_orphan,
    refresh_command_shell,
    refresh_shells_binding_guide,
)
from app.services import github as github_svc

router = APIRouter(prefix="/api/org", tags=["org"])


class BootstrapIn(BaseModel):
    org_id: str = "default"
    org_name: str = "Default Org"


class OrgSettingsIn(BaseModel):
    org_name: Optional[str] = None
    github_repo: Optional[str] = None
    github_branch: Optional[str] = None
    github_token: Optional[str] = None
    # Custom guide kinds: [{id, title, desc, category}]
    guide_kinds: Optional[list[dict]] = None
    # Deliverable path layout: {stages: {req: {root, aliases, named}, ...}}
    path_layout: Optional[dict] = None


class ProfileIn(BaseModel):
    key: str
    title: str = ""
    description: str = ""
    stages: list[str] = Field(default_factory=list)
    # stage → ordered task_id list
    tasks: dict[str, list[str]] = Field(default_factory=dict)


class StageTaskIn(BaseModel):
    profile_key: str = "*"
    stage: str
    task_id: str
    title_zh: str = ""
    title_en: str = ""
    required: bool = True
    guides: list[str] = Field(default_factory=list)
    sensors: list[str] = Field(default_factory=list)
    enabled: bool = True


class GuideIn(BaseModel):
    asset_id: str
    name: str = ""
    kind: str = "guide.skill"
    stage: str = ""
    task: str = ""
    version: str = "1.0.0"
    status: str = "draft"
    source: str = ""
    content: str = ""
    content_mode: str = "markdown"  # text|markdown|package
    ref_skills: list[str] = Field(default_factory=list)


ASSET_NAME_MAX = 20
GUIDE_SOURCE_MAX = 16


def _normalize_asset_name(name: str | None, asset_id: str) -> str:
    cleaned = (name or "").strip()
    if len(cleaned) > ASSET_NAME_MAX:
        raise HTTPException(400, f"名称不能超过 {ASSET_NAME_MAX} 个字")
    if cleaned:
        return cleaned
    return (asset_id or "").strip()[:ASSET_NAME_MAX]


def _normalize_guide_source(source: str | None) -> str:
    cleaned = (source or "").strip()
    if len(cleaned) > GUIDE_SOURCE_MAX:
        raise HTTPException(400, f"来源不能超过 {GUIDE_SOURCE_MAX} 个字")
    return cleaned


def _org_skill_asset_ids(session: SessionDep, org_id: str) -> set[str]:
    rows = session.exec(
        select(Guide).where(Guide.org_id == org_id, Guide.kind == "guide.skill")
    ).all()
    return {g.asset_id for g in rows if g.asset_id}


def _resolve_org_ref_skills(
    session: SessionDep,
    org_id: str,
    *,
    kind: str,
    asset_id: str,
    refs: list[str] | None,
) -> list[str]:
    return normalize_ref_skills(
        refs or [],
        kind=kind,
        self_asset_id=asset_id,
        allowed_skill_ids=_org_skill_asset_ids(session, org_id),
    )


def _enrich_org_guide(row: Guide) -> dict[str, Any]:
    d = row.model_dump()
    d["ref_skills"] = parse_ref_skills_json(getattr(row, "ref_skills_json", None))
    return d


class GuideFromGithubIn(BaseModel):
    repo: str
    skill_path: str
    asset_id: Optional[str] = None
    version: str = "1.0.0"
    status: str = "draft"
    guide_id: Optional[int] = None
    ref: Optional[str] = None
    org_id: str = "default"


class GuideFromGithubSkillItem(BaseModel):
    skill_path: str
    asset_id: Optional[str] = None


class GuideFromGithubBatchIn(BaseModel):
    repo: str
    skills: list[GuideFromGithubSkillItem]
    version: str = "1.0.0"
    status: str = "draft"
    ref: Optional[str] = None
    org_id: str = "default"


def _org_settings_row(session: SessionDep, org_id: str = "default"):
    return session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()


def _allowed_guide_kinds(session: SessionDep, org_id: str = "default") -> set[str]:
    from app.domain.guide_kinds import allowed_guide_kinds

    return allowed_guide_kinds(_org_settings_row(session, org_id))


def _assert_guide_kind_allowed(
    session: SessionDep,
    org_id: str,
    kind: str,
    *,
    previous_kind: str | None = None,
) -> None:
    allowed = _allowed_guide_kinds(session, org_id)
    if kind in allowed:
        return
    if previous_kind and kind == previous_kind:
        return
    raise HTTPException(400, f"unsupported guide kind: {kind}")


def _pick_primary_content(files: dict[str, bytes], kind: str) -> str:
    """Choose primary text content from uploaded package files."""
    preferred = []
    if "skill" in (kind or "").lower():
        preferred = ["SKILL.md", "skill.md"]
    elif "template" in (kind or "").lower():
        preferred = ["template.md", "TEMPLATE.md"]
    preferred += ["README.md", "readme.md"]

    lower_map = {k.replace("\\", "/").lstrip("./"): v for k, v in files.items()}
    for name in preferred:
        for path, data in lower_map.items():
            if path == name or path.endswith("/" + name):
                try:
                    return data.decode("utf-8")
                except UnicodeDecodeError:
                    continue
    # first .md
    for path, data in sorted(lower_map.items()):
        if path.lower().endswith(".md"):
            try:
                return data.decode("utf-8")
            except UnicodeDecodeError:
                continue
    # single file any text
    if len(lower_map) == 1:
        data = next(iter(lower_map.values()))
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError:
            return ""
    return ""


def _write_guide_package(org_id: str, asset_id: str, version: str, files: dict[str, bytes]) -> tuple[str, list[str]]:
    """Write package under data/guide-packages/...; return (rel_path, file list)."""
    settings = get_settings()
    rel = f"guide-packages/{org_id}/{asset_id}/{version}"
    root = settings.data_dir / rel
    if root.exists():
        import shutil

        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    for rel_path, data in files.items():
        clean = rel_path.replace("\\", "/").lstrip("./")
        if not clean or ".." in clean.split("/"):
            continue
        dest = root / clean
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        saved.append(clean)
    return rel, sorted(saved)


def _org_github_token(session: SessionDep, org_id: str = "default") -> str:
    cfg = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
    settings = get_settings()
    return ((cfg.github_token if cfg else None) or settings.github_token or "").strip()


def _parse_repo_or_400(repo: str) -> tuple[str, str]:
    parsed = github_svc.parse_github_owner_repo(repo)
    if not parsed:
        raise HTTPException(400, "无效的仓库名，请使用 owner/repo 或 https://github.com/owner/repo")
    return parsed

class SensorIn(BaseModel):
    asset_id: str
    name: str = ""
    kind: str = "sensor.rule"
    stage: str = ""
    task: str = ""
    version: str = "1.0.0"
    status: str = "draft"
    check_type: str = "rules"
    content: str = ""
    config_json: str = "{}"
    triggers: list[str] = Field(default_factory=lambda: ["hook:stop", "cli", "task-shell"])
    scope: list[str] = Field(default_factory=list)


def _sensor_row_fields(body: SensorIn) -> dict[str, Any]:
    from app.domain.sensor_specs import lean_sensor_content, normalize_scope, normalize_triggers

    data = body.model_dump(exclude={"triggers", "scope"})
    if data.get("check_type") == "manual":
        data["check_type"] = "human"
    if data.get("check_type") == "human":
        data["kind"] = "sensor.human"
    data["name"] = _normalize_asset_name(data.get("name"), data.get("asset_id") or "")
    data["content"] = lean_sensor_content(data.get("content") or "")
    data["triggers_json"] = json.dumps(normalize_triggers(body.triggers), ensure_ascii=False)
    data["scope_json"] = json.dumps(normalize_scope(body.scope), ensure_ascii=False)
    return data


class CommandIn(BaseModel):
    stage: str
    task: str
    slash_name: str = ""
    description: str = ""
    body: str = ""
    appendix: str = ""


def _settings_or_404(session: SessionDep, org_id: str = "default") -> OrgSettings:
    row = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
    if not row:
        row = OrgSettings(org_id=org_id)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


@router.get("/dashboard")
def dashboard(session: SessionDep, _user: CurrentUser, org_id: str = "default") -> dict[str, Any]:
    return {
        "profiles": len(session.exec(select(Profile).where(Profile.org_id == org_id)).all()),
        "tasks": len(session.exec(select(StageTask).where(StageTask.org_id == org_id, StageTask.profile_key == "*")).all()),
        "guides": len(session.exec(select(Guide).where(Guide.org_id == org_id)).all()),
        "sensors": len(session.exec(select(Sensor).where(Sensor.org_id == org_id)).all()),
        "commands": len(session.exec(select(CommandShell).where(CommandShell.org_id == org_id)).all()),
        "settings": _settings_or_404(session, org_id),
    }


@router.get("/operation-logs")
def list_org_operation_logs(
    session: SessionDep,
    _user: CurrentUser,
    org_id: str = "default",
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    rows = session.exec(select(OrgOperationLog).where(OrgOperationLog.org_id == org_id)).all()
    rows_sorted = sorted(rows, key=lambda r: (r.id or 0), reverse=True)
    page = rows_sorted[offset : offset + limit]
    out = []
    for r in page:
        try:
            detail = json.loads(r.detail_json or "{}")
        except json.JSONDecodeError:
            detail = {}
        out.append(
            {
                **r.model_dump(),
                "created_at": (
                    (r.created_at.replace(tzinfo=timezone.utc) if r.created_at and r.created_at.tzinfo is None else r.created_at)
                    .astimezone(timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z")
                    if r.created_at
                    else r.created_at
                ),
                "detail": detail,
            }
        )
    return {"total": len(rows_sorted), "items": out}


@router.post("/bootstrap")
def bootstrap(body: BootstrapIn, session: SessionDep, user: CurrentUser) -> dict[str, Any]:
    result = bootstrap_org(session, org_id=body.org_id, org_name=body.org_name)
    write_org_log(
        session,
        user,
        "bootstrap",
        f"初始化组织 {body.org_id}",
        detail={"org_id": body.org_id, "org_name": body.org_name, "result": result},
        org_id=body.org_id,
    )
    return result


@router.get("/settings")
def get_settings_api(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    row = _settings_or_404(session, org_id)
    from app.domain.guide_kinds import parse_custom_guide_kinds
    from app.domain.path_layout import path_layout_payload

    pl = path_layout_payload(getattr(row, "path_layout_json", None))
    return {
        "id": row.id,
        "org_id": row.org_id,
        "org_name": row.org_name,
        "github_repo": row.github_repo,
        "github_branch": row.github_branch,
        "github_token": row.github_token,
        "guide_kinds": parse_custom_guide_kinds(getattr(row, "guide_kinds_json", None)),
        "guide_kinds_json": getattr(row, "guide_kinds_json", None) or "[]",
        "path_layout": pl["path_layout"],
        "path_layout_customized": pl["path_layout_customized"],
        "path_layout_default": pl["path_layout_default"],
        "updated_at": row.updated_at,
    }


@router.get("/guide-kinds")
def list_guide_kinds(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    from app.domain.guide_kinds import guide_kinds_payload

    row = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
    return guide_kinds_payload(row)


@router.put("/settings")
def put_settings(body: OrgSettingsIn, session: SessionDep, user: CurrentUser, org_id: str = "default"):
    import json

    from app.domain.guide_kinds import normalize_custom_guide_kinds, parse_custom_guide_kinds
    from app.domain.org_task_shell import refresh_command_shell
    from app.domain.path_layout import normalize_path_layout, path_layout_payload

    row = _settings_or_404(session, org_id)
    changes = body.model_dump(exclude_unset=True)
    safe_detail = dict(changes)
    if safe_detail.get("github_token"):
        safe_detail["github_token"] = "***"
    guide_kinds = changes.pop("guide_kinds", None)
    path_layout = changes.pop("path_layout", None)
    for k, v in changes.items():
        setattr(row, k, v)
    if guide_kinds is not None:
        try:
            normalized = normalize_custom_guide_kinds(guide_kinds)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        row.guide_kinds_json = json.dumps(normalized, ensure_ascii=False)
        safe_detail["guide_kinds"] = normalized
    layout_changed = False
    if path_layout is not None:
        try:
            normalized_layout = normalize_path_layout(path_layout)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        row.path_layout_json = json.dumps(normalized_layout, ensure_ascii=False)
        safe_detail["path_layout"] = normalized_layout
        layout_changed = True
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)

    # Path layout feeds shell appendix — refresh catalog task shells.
    if layout_changed:
        catalog = session.exec(
            select(StageTask).where(StageTask.org_id == org_id, StageTask.profile_key == "*")
        ).all()
        for st in catalog:
            try:
                guides = json.loads(st.guides_json or "[]")
            except json.JSONDecodeError:
                guides = []
            try:
                sensors = json.loads(st.sensors_json or "[]")
            except json.JSONDecodeError:
                sensors = []
            refresh_command_shell(
                session,
                org_id,
                st.stage,
                st.task_id,
                title=st.title_zh or st.title_en or st.task_id,
                guides=list(guides),
                sensors=list(sensors),
            )

    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "settings_update",
        f"更新组织设置 {org_id}",
        detail=safe_detail,
        org_id=org_id,
    )
    pl = path_layout_payload(getattr(row, "path_layout_json", None))
    return {
        "id": row.id,
        "org_id": row.org_id,
        "org_name": row.org_name,
        "github_repo": row.github_repo,
        "github_branch": row.github_branch,
        "github_token": row.github_token,
        "guide_kinds": parse_custom_guide_kinds(getattr(row, "guide_kinds_json", None)),
        "guide_kinds_json": getattr(row, "guide_kinds_json", None) or "[]",
        "path_layout": pl["path_layout"],
        "path_layout_customized": pl["path_layout_customized"],
        "path_layout_default": pl["path_layout_default"],
        "updated_at": row.updated_at,
    }


# ---- Profiles ----

_BUILTIN_PROFILE_KEYS = frozenset({"lite", "standard", "strict", "enterprise"})


def _profile_tasks_map(session: SessionDep, org_id: str, profile_key: str) -> dict[str, list[str]]:
    rows = session.exec(
        select(StageTask).where(StageTask.org_id == org_id, StageTask.profile_key == profile_key)
    ).all()
    by_stage: dict[str, list[StageTask]] = {}
    for r in rows:
        by_stage.setdefault(r.stage, []).append(r)
    out: dict[str, list[str]] = {}
    for stage, items in by_stage.items():
        items.sort(key=lambda t: (getattr(t, "sort_order", 0) or 0, t.id or 0))
        out[stage] = [t.task_id for t in items]
    return out


def _sync_profile_tasks(
    session: SessionDep,
    org_id: str,
    profile_key: str,
    stages: list[str],
    tasks: dict[str, list[str]],
) -> None:
    """Upsert StageTask rows for profile_key from ordered stage→task_ids; remove extras."""
    stage_set = set(stages or [])
    wanted: dict[tuple[str, str], int] = {}
    for stage in stages or []:
        for idx, tid in enumerate(tasks.get(stage) or []):
            tid = (tid or "").strip()
            if tid:
                wanted[(stage, tid)] = idx

    existing = session.exec(
        select(StageTask).where(StageTask.org_id == org_id, StageTask.profile_key == profile_key)
    ).all()
    by_key = {(r.stage, r.task_id): r for r in existing}

    # delete removed / stages dropped
    for key, row in list(by_key.items()):
        if key not in wanted or row.stage not in stage_set:
            session.delete(row)
            by_key.pop(key, None)

    # catalog templates for copy
    catalog = session.exec(
        select(StageTask).where(StageTask.org_id == org_id, StageTask.profile_key == "*")
    ).all()
    catalog_map = {(r.stage, r.task_id): r for r in catalog}

    for (stage, tid), order in wanted.items():
        row = by_key.get((stage, tid))
        if row:
            row.sort_order = order
            session.add(row)
            continue
        src = catalog_map.get((stage, tid))
        session.add(
            StageTask(
                org_id=org_id,
                profile_key=profile_key,
                stage=stage,
                task_id=tid,
                title_zh=(src.title_zh if src else ""),
                title_en=(src.title_en if src else ""),
                required=(src.required if src else True),
                suite="",
                guides_json=(src.guides_json if src else "[]"),
                sensors_json=(src.sensors_json if src else "[]"),
                enabled=(src.enabled if src else True),
                sort_order=order,
            )
        )


def _profile_payload(session: SessionDep, row: Profile) -> dict:
    return {
        "id": row.id,
        "key": row.key,
        "title": row.title,
        "description": row.description,
        "stages": json.loads(row.stages_json or "[]"),
        "tasks": _profile_tasks_map(session, row.org_id, row.key),
    }


@router.get("/profiles")
def list_profiles(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    rows = session.exec(select(Profile).where(Profile.org_id == org_id)).all()
    return [_profile_payload(session, r) for r in rows]


@router.post("/profiles")
def create_profile(body: ProfileIn, session: SessionDep, user: CurrentUser, org_id: str = "default"):
    if body.key in _BUILTIN_PROFILE_KEYS:
        raise HTTPException(400, f"不可使用内置 Profile Key「{body.key}」")
    exists = session.exec(select(Profile).where(Profile.org_id == org_id, Profile.key == body.key)).first()
    if exists:
        raise HTTPException(400, f"profile {body.key} exists")
    row = Profile(
        org_id=org_id,
        key=body.key,
        title=body.title or body.key,
        description=body.description,
        stages_json=json.dumps(body.stages),
    )
    session.add(row)
    session.flush()
    _sync_profile_tasks(session, org_id, body.key, body.stages, body.tasks or {})
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "profile_create",
        f"新建 Profile {body.key}",
        detail={"key": body.key, "stages": body.stages, "tasks": body.tasks or {}},
        org_id=org_id,
    )
    return _profile_payload(session, row)


@router.put("/profiles/{profile_id}")
def update_profile(profile_id: int, body: ProfileIn, session: SessionDep, user: CurrentUser):
    row = session.get(Profile, profile_id)
    if not row:
        raise HTTPException(404)
    if row.key in _BUILTIN_PROFILE_KEYS:
        raise HTTPException(400, f"内置 Profile「{row.key}」不可修改")
    if body.key != row.key and body.key in _BUILTIN_PROFILE_KEYS:
        raise HTTPException(400, f"不可将 Key 改为内置名「{body.key}」")
    old_key = row.key
    row.key = body.key
    row.title = body.title
    row.description = body.description
    row.stages_json = json.dumps(body.stages)
    session.add(row)
    if old_key != body.key:
        # move tasks to new key then sync
        for t in session.exec(
            select(StageTask).where(StageTask.org_id == row.org_id, StageTask.profile_key == old_key)
        ).all():
            t.profile_key = body.key
            session.add(t)
    _sync_profile_tasks(session, row.org_id, body.key, body.stages, body.tasks or {})
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "profile_update",
        f"更新 Profile {body.key}",
        detail={"id": profile_id, "old_key": old_key, "key": body.key, "stages": body.stages, "tasks": body.tasks or {}},
        org_id=row.org_id,
    )
    return _profile_payload(session, row)


@router.delete("/profiles/{profile_id}")
def delete_profile(profile_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(Profile, profile_id)
    if not row:
        raise HTTPException(404)
    if row.key in _BUILTIN_PROFILE_KEYS:
        raise HTTPException(400, f"内置 Profile「{row.key}」不可删除")
    key = row.key
    org_id = row.org_id
    for t in session.exec(
        select(StageTask).where(StageTask.org_id == row.org_id, StageTask.profile_key == row.key)
    ).all():
        session.delete(t)
    session.delete(row)
    session.commit()
    write_org_log(
        session,
        user,
        "profile_delete",
        f"删除 Profile {key}",
        detail={"id": profile_id, "key": key},
        org_id=org_id,
    )
    return {"ok": True}


# ---- Stage tasks ----


@router.get("/tasks")
def list_tasks(
    session: SessionDep,
    _user: CurrentUser,
    org_id: str = "default",
    profile_key: str = "*",
    stage: Optional[str] = None,
):
    q = select(StageTask).where(StageTask.org_id == org_id, StageTask.profile_key == profile_key)
    if stage:
        q = q.where(StageTask.stage == stage)
    rows = list(session.exec(q).all())
    rows.sort(key=lambda r: (r.stage, getattr(r, "sort_order", 0) or 0, r.id or 0))

    # Aggregate which named profiles contain each (stage, task_id)
    all_q = select(StageTask).where(StageTask.org_id == org_id)
    if stage:
        all_q = all_q.where(StageTask.stage == stage)
    by_task: dict[tuple[str, str], list[str]] = {}
    for r in session.exec(all_q).all():
        if not r.profile_key or r.profile_key == "*":
            continue
        key = (r.stage, r.task_id)
        bucket = by_task.setdefault(key, [])
        if r.profile_key not in bucket:
            bucket.append(r.profile_key)
    for keys in by_task.values():
        keys.sort()

    return [
        {
            "id": r.id,
            "profile_key": r.profile_key,
            "stage": r.stage,
            "task_id": r.task_id,
            "title_zh": r.title_zh,
            "title_en": r.title_en,
            "required": r.required,
            "guides": json.loads(r.guides_json or "[]"),
            "sensors": json.loads(r.sensors_json or "[]"),
            "enabled": r.enabled,
            "sort_order": getattr(r, "sort_order", 0) or 0,
            "profiles": by_task.get((r.stage, r.task_id), []),
        }
        for r in rows
    ]


@router.post("/tasks")
def create_task(body: StageTaskIn, session: SessionDep, user: CurrentUser, org_id: str = "default"):
    row = StageTask(
        org_id=org_id,
        profile_key=body.profile_key,
        stage=body.stage,
        task_id=body.task_id,
        title_zh=body.title_zh,
        title_en=body.title_en,
        required=body.required,
        suite="",
        guides_json=json.dumps(body.guides),
        sensors_json=json.dumps(body.sensors),
        enabled=body.enabled,
    )
    session.add(row)
    refresh_command_shell(
        session,
        org_id,
        body.stage,
        body.task_id,
        title=body.title_zh or body.title_en or body.task_id,
        guides=list(body.guides or []),
        sensors=list(body.sensors or []),
    )
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "task_create",
        f"新建 Task {body.stage}/{body.task_id}",
        detail=body.model_dump(),
        org_id=org_id,
    )
    return row


@router.put("/tasks/{task_row_id}")
def update_task(task_row_id: int, body: StageTaskIn, session: SessionDep, user: CurrentUser):
    row = session.get(StageTask, task_row_id)
    if not row:
        raise HTTPException(404)
    old_stage = row.stage
    old_task = row.task_id
    old_profile = row.profile_key or "*"
    row.profile_key = body.profile_key
    row.stage = body.stage
    row.task_id = body.task_id
    row.title_zh = body.title_zh
    row.title_en = body.title_en
    row.required = body.required
    row.suite = ""
    row.guides_json = json.dumps(body.guides)
    row.sensors_json = json.dumps(body.sensors)
    row.enabled = body.enabled
    session.add(row)

    cascaded_profiles: list[str] = []
    # Catalog update must cascade bindings to profile copies (project sync reads profile rows).
    if (old_profile == "*" or (body.profile_key or "*") == "*") and (body.profile_key or "*") == "*":
        siblings = session.exec(
            select(StageTask).where(
                StageTask.org_id == row.org_id,
                StageTask.stage == old_stage,
                StageTask.task_id == old_task,
                StageTask.id != row.id,  # type: ignore[arg-type]
            )
        ).all()
        for sib in siblings:
            if (sib.profile_key or "*") == "*":
                continue
            cascaded_profiles.append(sib.profile_key or "")
            sib.stage = body.stage
            sib.task_id = body.task_id
            sib.title_zh = body.title_zh
            sib.title_en = body.title_en
            sib.required = body.required
            sib.suite = ""
            sib.guides_json = json.dumps(body.guides)
            sib.sensors_json = json.dumps(body.sensors)
            sib.enabled = body.enabled
            session.add(sib)

    refresh_command_shell(
        session,
        row.org_id,
        body.stage,
        body.task_id,
        title=body.title_zh or body.title_en or body.task_id,
        guides=list(body.guides or []),
        sensors=list(body.sensors or []),
        old_stage=old_stage,
        old_task=old_task,
    )
    # If stage/task_id renamed and another StageTask still uses the old key, keep its shell;
    # otherwise remove orphan shell left at the old key when keys changed.
    if (old_stage, old_task) != (body.stage, body.task_id):
        delete_command_shell_if_orphan(session, row.org_id, old_stage, old_task)
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "task_update",
        f"更新 Task {body.stage}/{body.task_id}"
        + (f"（级联绑定 {len(cascaded_profiles)} 个 profile）" if cascaded_profiles else ""),
        detail={"id": task_row_id, **body.model_dump(), "cascaded_profiles": cascaded_profiles},
        org_id=row.org_id,
    )
    return {
        "id": row.id,
        "profile_key": row.profile_key,
        "stage": row.stage,
        "task_id": row.task_id,
        "title_zh": row.title_zh,
        "title_en": row.title_en,
        "required": row.required,
        "guides": json.loads(row.guides_json or "[]"),
        "sensors": json.loads(row.sensors_json or "[]"),
        "enabled": row.enabled,
        "cascaded_profiles": cascaded_profiles,
    }


@router.delete("/tasks/{task_row_id}")
def delete_task(task_row_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(StageTask, task_row_id)
    if not row:
        raise HTTPException(404)
    detail = {
        "id": row.id,
        "profile_key": row.profile_key,
        "stage": row.stage,
        "task_id": row.task_id,
    }
    org_id = row.org_id
    stage = row.stage
    task_id = row.task_id
    profile_key = row.profile_key
    summary = f"删除 Task {row.stage}/{row.task_id}"

    cascaded_profiles: list[str] = []
    # Catalog delete must cascade: profile StageTask copies keep shells / project sync alive.
    if (profile_key or "*") == "*":
        siblings = session.exec(
            select(StageTask).where(
                StageTask.org_id == org_id,
                StageTask.stage == stage,
                StageTask.task_id == task_id,
                StageTask.id != row.id,  # type: ignore[arg-type]
            )
        ).all()
        for sib in siblings:
            cascaded_profiles.append(sib.profile_key or "")
            session.delete(sib)
        detail["cascaded_profiles"] = cascaded_profiles

    session.delete(row)
    session.flush()
    deleted_shell = delete_command_shell_if_orphan(session, org_id, stage, task_id)
    session.commit()
    write_org_log(
        session,
        user,
        "task_delete",
        summary + (f"（级联 {len(cascaded_profiles)} 个 profile）" if cascaded_profiles else ""),
        detail=detail,
        org_id=org_id,
    )
    return {"ok": True, "deleted_shell": deleted_shell, "cascaded_profiles": cascaded_profiles}


# ---- Guides / Sensors / Commands ----


@router.get("/guides")
def list_guides(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    rows = session.exec(select(Guide).where(Guide.org_id == org_id)).all()
    return [_enrich_org_guide(r) for r in rows]


@router.post("/guides")
def create_guide(body: GuideIn, session: SessionDep, user: CurrentUser, org_id: str = "default"):
    _assert_guide_kind_allowed(session, org_id, body.kind)
    mode = body.content_mode if body.content_mode in ("text", "markdown", "package") else "markdown"
    refs = _resolve_org_ref_skills(
        session, org_id, kind=body.kind, asset_id=body.asset_id, refs=body.ref_skills
    )
    row = Guide(
        org_id=org_id,
        asset_id=body.asset_id,
        name=_normalize_asset_name(body.name, body.asset_id),
        kind=body.kind,
        stage=body.stage,
        task=body.task,
        version=body.version,
        status=body.status,
        source=_normalize_guide_source(body.source),
        content=body.content,
        content_mode=mode,
        package_path="",
        package_files_json="[]",
        ref_skills_json=ref_skills_to_json(refs),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "guide_create",
        f"新建 Guide {body.asset_id}",
        detail={
            "id": row.id,
            "asset_id": body.asset_id,
            "kind": body.kind,
            "content_mode": mode,
            "ref_skills": refs,
        },
        org_id=org_id,
    )
    return _enrich_org_guide(row)


@router.put("/guides/{guide_id}")
def update_guide(guide_id: int, body: GuideIn, session: SessionDep, user: CurrentUser):
    row = session.get(Guide, guide_id)
    if not row:
        raise HTTPException(404)
    _assert_guide_kind_allowed(
        session, row.org_id or "default", body.kind, previous_kind=row.kind
    )
    mode = body.content_mode if body.content_mode in ("text", "markdown", "package") else "markdown"
    refs = _resolve_org_ref_skills(
        session,
        row.org_id or "default",
        kind=body.kind,
        asset_id=body.asset_id,
        refs=body.ref_skills,
    )
    row.asset_id = body.asset_id
    row.name = _normalize_asset_name(body.name, body.asset_id)
    row.kind = body.kind
    row.stage = body.stage
    row.task = body.task
    row.version = body.version
    row.status = body.status
    row.source = _normalize_guide_source(body.source)
    row.content = body.content
    row.content_mode = mode
    row.ref_skills_json = ref_skills_to_json(refs)
    if mode != "package":
        # keep package on disk but clear pointer when switching to inline
        row.package_path = ""
        row.package_files_json = "[]"
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "guide_update",
        f"更新 Guide {body.asset_id}",
        detail={
            "id": guide_id,
            "asset_id": body.asset_id,
            "kind": body.kind,
            "content_mode": mode,
            "status": body.status,
            "ref_skills": refs,
        },
        org_id=row.org_id,
    )
    return _enrich_org_guide(row)


@router.post("/guides/upload")
async def upload_guide(
    session: SessionDep,
    user: CurrentUser,
    asset_id: str = Form(...),
    name: str = Form(""),
    kind: str = Form("guide.skill"),
    stage: str = Form(""),
    task: str = Form(""),
    version: str = Form("1.0.0"),
    status: str = Form("draft"),
    source: str = Form(""),
    org_id: str = Form("default"),
    guide_id: Optional[int] = Form(None),
    ref_skills: str = Form("[]"),
    files: list[UploadFile] = File(default_factory=list),
    relative_paths: list[str] = Form(default_factory=list),
):
    """Create/update a Guide from uploaded file(s) or folder (multipart)."""
    if guide_id:
        existing = session.get(Guide, guide_id)
        prev = existing.kind if existing else None
    else:
        prev = None
    _assert_guide_kind_allowed(session, org_id, kind, previous_kind=prev)
    if not asset_id.strip():
        raise HTTPException(400, "asset_id required")
    if not files:
        raise HTTPException(400, "at least one file required")

    file_map: dict[str, bytes] = {}
    for i, uf in enumerate(files):
        data = await uf.read()
        rel = relative_paths[i] if i < len(relative_paths) and relative_paths[i] else (uf.filename or f"file-{i}")
        # browser folder upload: path may be "dirname/SKILL.md"
        file_map[rel] = data

    pkg_rel, saved = _write_guide_package(org_id, asset_id.strip(), version.strip() or "1.0.0", file_map)
    content = _pick_primary_content(file_map, kind)

    if guide_id:
        row = session.get(Guide, guide_id)
        if not row:
            raise HTTPException(404, "guide not found")
        action = "guide_upload_update"
        summary = f"上传更新 Guide {asset_id.strip()}"
    else:
        row = Guide(org_id=org_id)
        action = "guide_upload_create"
        summary = f"上传新建 Guide {asset_id.strip()}"

    refs = _resolve_org_ref_skills(
        session,
        org_id,
        kind=kind,
        asset_id=asset_id.strip(),
        refs=parse_ref_skills_raw(ref_skills),
    )
    row.asset_id = asset_id.strip()
    row.name = _normalize_asset_name(name, row.asset_id)
    row.kind = kind
    row.stage = stage
    row.task = task
    row.version = version.strip() or "1.0.0"
    row.status = status
    row.source = _normalize_guide_source(source)
    row.content = content
    row.content_mode = "package"
    row.package_path = pkg_rel
    row.package_files_json = json.dumps(saved, ensure_ascii=False)
    row.ref_skills_json = ref_skills_to_json(refs)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    refresh_shells_binding_guide(session, org_id, row.asset_id)
    session.commit()
    write_org_log(
        session,
        user,
        action,
        summary,
        detail={
            "id": row.id,
            "asset_id": row.asset_id,
            "kind": kind,
            "files": saved,
            "package_path": pkg_rel,
            "ref_skills": refs,
        },
        org_id=org_id,
    )
    return _enrich_org_guide(row)

@router.get("/guides/github-skills")
def list_github_skills(
    session: SessionDep,
    _user: CurrentUser,
    repo: str,
    ref: str = "",
    org_id: str = "default",
):
    """List skill directories (containing SKILL.md) in a GitHub repository."""
    owner, name = _parse_repo_or_400(repo)
    token = _org_github_token(session, org_id)
    try:
        skills = github_svc.list_repo_skills(owner, name, token=token or None, ref=ref or None)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc
    return {
        "repo": f"{owner}/{name}",
        "ref": (ref or "").strip() or None,
        "skills": [{"id": s.id, "path": s.path, "skill_md_path": s.skill_md_path} for s in skills],
    }


@router.post("/guides/from-github")
def create_guide_from_github(body: GuideFromGithubIn, session: SessionDep, user: CurrentUser):
    """Download a skill directory from GitHub and install as guide.skill package."""
    try:
        result = _install_guide_from_github(
            session,
            repo=body.repo,
            skill_path=body.skill_path,
            asset_id=body.asset_id,
            version=body.version,
            status=body.status,
            guide_id=body.guide_id,
            ref=body.ref,
            org_id=body.org_id,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc
    asset_id = getattr(result, "asset_id", None) or body.asset_id or body.skill_path
    write_org_log(
        session,
        user,
        "guide_from_github",
        f"从 GitHub 安装 Guide {asset_id}",
        detail={"repo": body.repo, "skill_path": body.skill_path, "asset_id": asset_id, "ref": body.ref},
        org_id=body.org_id,
    )
    return result


def _install_guide_from_github(
    session: SessionDep,
    *,
    repo: str,
    skill_path: str,
    asset_id: Optional[str] = None,
    version: str = "1.0.0",
    status: str = "draft",
    guide_id: Optional[int] = None,
    ref: Optional[str] = None,
    org_id: str = "default",
    skip_if_exists: bool = False,
) -> Guide | dict[str, Any]:
    owner, name = _parse_repo_or_400(repo)
    skill_path = (skill_path or "").replace("\\", "/").strip("/")
    if not skill_path:
        raise HTTPException(400, "skill_path required")
    token = _org_github_token(session, org_id)
    try:
        file_map = github_svc.fetch_repo_subtree_files(
            owner, name, skill_path, token=token or None, ref=ref or None
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc

    if not any(p.replace("\\", "/").rsplit("/", 1)[-1].lower() == "skill.md" for p in file_map):
        raise HTTPException(400, "所选目录中未找到 SKILL.md")

    default_id = "skill" if skill_path in (".",) else skill_path.rsplit("/", 1)[-1]
    aid = (asset_id or "").strip() or default_id
    ver = (version or "1.0.0").strip() or "1.0.0"
    kind = "guide.skill"

    if guide_id:
        row = session.get(Guide, guide_id)
        if not row:
            raise HTTPException(404, "guide not found")
    else:
        existing = session.exec(
            select(Guide).where(Guide.org_id == org_id, Guide.asset_id == aid)
        ).first()
        if existing:
            if skip_if_exists:
                return {"skipped": True, "asset_id": aid, "reason": "asset_id 已存在"}
            raise HTTPException(400, f"asset_id 已存在: {aid}，请更换或传入 guide_id 覆盖")
        row = Guide(org_id=org_id)

    pkg_rel, saved = _write_guide_package(org_id, aid, ver, file_map)
    content = _pick_primary_content(file_map, kind)

    row.asset_id = aid
    row.name = _normalize_asset_name(getattr(row, "name", None) or "", aid)
    row.kind = kind
    row.stage = ""
    row.task = ""
    row.version = ver
    row.status = status or "draft"
    row.content = content
    row.content_mode = "package"
    row.package_path = pkg_rel
    row.package_files_json = json.dumps(saved, ensure_ascii=False)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.post("/guides/from-github-batch")
def create_guides_from_github_batch(body: GuideFromGithubBatchIn, session: SessionDep, user: CurrentUser):
    """Install multiple GitHub skills as guide.skill packages."""
    if not body.skills:
        raise HTTPException(400, "skills required")
    created: list[Any] = []
    skipped: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for item in body.skills:
        sp = (item.skill_path or "").strip()
        try:
            result = _install_guide_from_github(
                session,
                repo=body.repo,
                skill_path=sp,
                asset_id=item.asset_id,
                version=body.version,
                status=body.status,
                ref=body.ref,
                org_id=body.org_id,
                skip_if_exists=True,
            )
            if isinstance(result, dict) and result.get("skipped"):
                skipped.append(result)
            else:
                created.append(result)
        except HTTPException as exc:
            errors.append({"skill_path": sp, "detail": exc.detail})
        except Exception as exc:  # noqa: BLE001
            errors.append({"skill_path": sp, "detail": str(exc)})
    created_ids = [getattr(r, "asset_id", None) for r in created if not isinstance(r, dict)]
    write_org_log(
        session,
        user,
        "guide_from_github_batch",
        f"批量从 GitHub 安装 Guide：+{len(created_ids)}/skip{len(skipped)}/err{len(errors)}",
        detail={
            "repo": body.repo,
            "ref": body.ref,
            "created": created_ids,
            "skipped": skipped,
            "errors": errors,
        },
        org_id=body.org_id,
    )
    return {"created": created, "skipped": skipped, "errors": errors}


def _guide_package_root(row: Guide) -> Path:
    settings = get_settings()
    rel = (row.package_path or "").strip().replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise HTTPException(404, "无 package")
    root = (settings.data_dir / rel).resolve()
    data_root = settings.data_dir.resolve()
    if not str(root).startswith(str(data_root)) or not root.is_dir():
        raise HTTPException(404, "package 目录不存在")
    return root


@router.get("/guides/{guide_id}/package")
def get_guide_package(guide_id: int, session: SessionDep, _user: CurrentUser):
    row = session.get(Guide, guide_id)
    if not row:
        raise HTTPException(404)
    meta_files: list[str] = []
    try:
        meta_files = [
            str(f).replace("\\", "/").lstrip("./")
            for f in json.loads(row.package_files_json or "[]")
            if str(f).strip()
        ]
    except json.JSONDecodeError:
        meta_files = []
    disk_files: list[str] = []
    if row.package_path:
        try:
            root = _guide_package_root(row)
            disk_files = sorted(
                str(p.relative_to(root)).replace("\\", "/")
                for p in root.rglob("*")
                if p.is_file()
            )
        except HTTPException:
            disk_files = []
    # Merge metadata + disk so the left tree shows the full package inventory.
    files = merge_package_file_list(
        sorted({*meta_files, *disk_files}),
        content=row.content or "",
        kind=row.kind or "",
    )
    return {
        "id": row.id,
        "asset_id": row.asset_id,
        "package_path": row.package_path or "",
        "content_mode": row.content_mode,
        "kind": row.kind,
        "files": files,
        "content": row.content or "",
    }


@router.get("/guides/{guide_id}/package-file")
def get_guide_package_file(
    guide_id: int,
    path: str,
    session: SessionDep,
    _user: CurrentUser,
):
    row = session.get(Guide, guide_id)
    if not row:
        raise HTTPException(404)
    rel = (path or "").replace("\\", "/").lstrip("./")
    if not rel or ".." in rel.split("/"):
        raise HTTPException(400, "invalid path")
    if (row.kind or "") == "guide.template" and Path(rel).name.lower() == "skill.md":
        raise HTTPException(404, "template 包不含 SKILL.md")
    root = None
    if (row.package_path or "").strip():
        try:
            root = _guide_package_root(row)
        except HTTPException:
            root = None
    if root is not None:
        target = (root / rel).resolve()
        if str(target).startswith(str(root)) and target.is_file():
            data = target.read_bytes()
            ctype, _ = mimetypes.guess_type(str(target))
            return Response(
                content=data,
                media_type=ctype or "application/octet-stream",
                headers={"Content-Disposition": content_disposition_inline(target.name)},
            )
    if content_fallback_for_path(rel, row.kind or "") and (row.content or "").strip():
        data = (row.content or "").encode("utf-8")
        return Response(
            content=data,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": content_disposition_inline(Path(rel).name)},
        )
    if root is None and not (row.package_path or "").strip():
        raise HTTPException(404, "无 package")
    raise HTTPException(404, "文件不存在于包目录（可能已丢失）")


@router.put("/guides/{guide_id}/package-file")
async def put_guide_package_file(
    guide_id: int,
    path: str,
    session: SessionDep,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    """Overwrite a single file inside a guide package (docx/xlsx/md online edit write-back)."""
    row = session.get(Guide, guide_id)
    if not row:
        raise HTTPException(404)
    pkg = (row.package_path or "").strip()
    if not pkg or (row.content_mode or "") != "package":
        raise HTTPException(400, "仅 package 模式且已有包路径时可写回文件")
    rel = (path or "").replace("\\", "/").lstrip("./")
    if not rel or ".." in rel.split("/"):
        raise HTTPException(400, "invalid path")
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    try:
        saved = write_single_package_file(pkg, rel, data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    # Refresh primary text content when editing a text-like primary
    file_map = {rel: data}
    # Also include other disk files names only for pick? pick needs bytes — use edited file only if md
    if Path(rel).suffix.lower() in (".md", ".markdown", ".txt"):
        try:
            text = data.decode("utf-8")
            row.content = text
        except UnicodeDecodeError:
            pass
    else:
        # keep existing content; optionally note primary binary
        pass
    row.package_files_json = package_files_json_dumps(saved)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    refresh_shells_binding_guide(session, row.org_id or "default", row.asset_id)
    session.commit()
    write_org_log(
        session,
        user,
        "guide_package_file_put",
        f"写回 Guide 包文件 {row.asset_id}:{rel}",
        detail={"id": row.id, "path": rel, "bytes": len(data)},
        org_id=row.org_id,
    )
    return {
        "ok": True,
        "path": rel,
        "files": merge_package_file_list(saved, content=row.content or "", kind=row.kind or ""),
        "package_path": row.package_path,
    }

@router.delete("/guides/{guide_id}")
def delete_guide(guide_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(Guide, guide_id)
    if not row:
        raise HTTPException(404)
    detail = {"id": row.id, "asset_id": row.asset_id, "kind": row.kind}
    org_id = row.org_id
    summary = f"删除 Guide {row.asset_id}"
    session.delete(row)
    session.commit()
    write_org_log(session, user, "guide_delete", summary, detail=detail, org_id=org_id)
    return {"ok": True}


@router.get("/sensors")
def list_sensors(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    rows = session.exec(select(Sensor).where(Sensor.org_id == org_id)).all()
    out = []
    for r in rows:
        try:
            triggers = json.loads(getattr(r, "triggers_json", None) or "[]")
        except json.JSONDecodeError:
            triggers = ["hook:stop", "cli", "task-shell"]
        try:
            scope = json.loads(getattr(r, "scope_json", None) or "[]")
        except json.JSONDecodeError:
            scope = []
        d = r.model_dump()
        d["triggers"] = triggers if triggers else ["hook:stop", "cli", "task-shell"]
        d["scope"] = scope
        out.append(d)
    return out


@router.post("/sensors")
def create_sensor(body: SensorIn, session: SessionDep, user: CurrentUser, org_id: str = "default"):
    data = _sensor_row_fields(body)
    row = Sensor(org_id=org_id, **data)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "sensor_create",
        f"新建 Check {body.asset_id}",
        detail={"id": row.id, "asset_id": body.asset_id, "check_type": getattr(row, "check_type", "")},
        org_id=org_id,
    )
    return row


@router.put("/sensors/{sensor_id}")
def update_sensor(sensor_id: int, body: SensorIn, session: SessionDep, user: CurrentUser):
    row = session.get(Sensor, sensor_id)
    if not row:
        raise HTTPException(404)
    data = _sensor_row_fields(body)
    for k, v in data.items():
        setattr(row, k, v)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "sensor_update",
        f"更新 Check {body.asset_id}",
        detail={"id": sensor_id, "asset_id": body.asset_id, "check_type": getattr(row, "check_type", "")},
        org_id=row.org_id,
    )
    return row


@router.delete("/sensors/{sensor_id}")
def delete_sensor(sensor_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(Sensor, sensor_id)
    if not row:
        raise HTTPException(404)
    detail = {"id": row.id, "asset_id": row.asset_id, "kind": row.kind}
    org_id = row.org_id
    summary = f"删除 Check {row.asset_id}"
    session.delete(row)
    session.commit()
    write_org_log(session, user, "sensor_delete", summary, detail=detail, org_id=org_id)
    return {"ok": True}


@router.get("/commands")
def list_commands(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    return session.exec(select(CommandShell).where(CommandShell.org_id == org_id)).all()


@router.get("/commands/preview")
def preview_command(
    session: SessionDep,
    _user: CurrentUser,
    stage: str,
    task: str,
    org_id: str = "default",
):
    """Generate default shell content based on StageTask definition + bound guides/sensors."""
    row = session.exec(
        select(StageTask).where(
            StageTask.org_id == org_id,
            StageTask.profile_key == "*",
            StageTask.stage == stage,
            StageTask.task_id == task,
        )
    ).first()

    title = (row.title_zh if row else "") or task
    guide_ids: list[str] = json.loads(row.guides_json) if row else []
    sensor_ids: list[str] = json.loads(row.sensors_json) if row else []
    return assemble_from_bindings(
        session,
        org_id,
        stage,
        task,
        title=title,
        guides=guide_ids,
        sensors=sensor_ids,
    )


@router.post("/commands")
def create_command(body: CommandIn, session: SessionDep, user: CurrentUser, org_id: str = "default"):
    slash = body.slash_name or f"hx-{body.stage}-{body.task.replace('_', '-')}"
    row = CommandShell(
        org_id=org_id,
        stage=body.stage,
        task=body.task,
        slash_name=slash,
        description=body.description,
        body=body.body,
        appendix=body.appendix,
        impl="both",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "command_create",
        f"新建 Command {slash}",
        detail={"id": row.id, "stage": body.stage, "task": body.task, "slash_name": slash},
        org_id=org_id,
    )
    return row


@router.put("/commands/{command_id}")
def update_command(command_id: int, body: CommandIn, session: SessionDep, user: CurrentUser):
    row = session.get(CommandShell, command_id)
    if not row:
        raise HTTPException(404)
    row.stage = body.stage
    row.task = body.task
    row.slash_name = body.slash_name or row.slash_name
    row.description = body.description
    row.body = body.body
    row.appendix = body.appendix
    row.impl = "both"
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_org_log(
        session,
        user,
        "command_update",
        f"更新 Command {row.slash_name}",
        detail={"id": command_id, "stage": body.stage, "task": body.task, "slash_name": row.slash_name},
        org_id=row.org_id,
    )
    return row


@router.delete("/commands/{command_id}")
def delete_command(command_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(CommandShell, command_id)
    if not row:
        raise HTTPException(404)
    detail = {"id": row.id, "slash_name": row.slash_name, "stage": row.stage, "task": row.task}
    org_id = row.org_id
    summary = f"删除 Command {row.slash_name}"
    session.delete(row)
    session.commit()
    write_org_log(session, user, "command_delete", summary, detail=detail, org_id=org_id)
    return {"ok": True}


# ---- Export / GitHub ----


@router.post("/export-hub")
def export_hub_api(session: SessionDep, user: CurrentUser, org_id: str = "default"):
    settings = get_settings()
    dest = settings.hubs_dir / org_id
    meta = export_hub(session, org_id, dest)
    write_org_log(
        session,
        user,
        "export_hub",
        f"导出 Hub {org_id}",
        detail={"path": str(dest), "export_meta": meta},
        org_id=org_id,
    )
    return {"ok": True, "path": str(dest), "export_meta": meta}


@router.post("/github/dry-run")
def github_dry_run(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    cfg = _settings_or_404(session, org_id)
    settings = get_settings()
    hub_dir = settings.hubs_dir / org_id
    meta = export_hub(session, org_id, hub_dir)
    work = settings.repos_dir / f"org-{org_id}"
    token = cfg.github_token or settings.github_token
    result = github_svc.dry_run_diff(work, cfg.github_repo, cfg.github_branch or "main", token, source=hub_dir)
    job = PushJob(
        org_id=org_id,
        kind="dry-run",
        status="success" if result.ok else "failed",
        remote=cfg.github_repo,
        branch=cfg.github_branch,
        message=result.message,
        diff_text=result.diff_text,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return {
        "ok": result.ok,
        "message": result.message,
        "diff_text": result.diff_text,
        "job_id": job.id,
        "export_meta": meta,
    }


@router.post("/github/push")
def github_push(
    session: SessionDep,
    user: CurrentUser,
    org_id: str = "default",
    message: str = "chore: sync org HX hub from WebUI",
):
    cfg = _settings_or_404(session, org_id)
    if not cfg.github_repo:
        raise HTTPException(400, "github_repo not configured")
    settings = get_settings()
    hub_dir = settings.hubs_dir / org_id
    meta = export_hub(session, org_id, hub_dir)
    work = settings.repos_dir / f"org-{org_id}"
    token = cfg.github_token or settings.github_token
    result = github_svc.commit_and_push(
        work, cfg.github_repo, cfg.github_branch or "main", token, message, source=hub_dir
    )
    # Clarify unchanged tree vs success push
    msg = result.message
    if result.ok and msg == "nothing to commit":
        msg = "nothing to commit (tree unchanged after full export)"
    elif result.ok and msg == "pushed":
        counts = meta.get("counts") or {}
        msg = (
            f"pushed — files={counts.get('files', 0)} "
            f"guides={counts.get('guides', 0)} sensors={counts.get('sensors', 0)} "
            f"commands={counts.get('commands', 0)}"
        )
    job = PushJob(
        org_id=org_id,
        kind="push",
        status="success" if result.ok else "failed",
        remote=cfg.github_repo,
        branch=cfg.github_branch,
        commit_sha=result.commit_sha,
        message=msg,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    write_org_log(
        session,
        user,
        "github_push",
        f"GitHub 推送：{msg}",
        detail={
            "ok": result.ok,
            "message": msg,
            "commit_sha": result.commit_sha,
            "job_id": job.id,
            "remote": cfg.github_repo,
            "branch": cfg.github_branch,
        },
        org_id=org_id,
    )
    return {
        "ok": result.ok,
        "message": msg,
        "commit_sha": result.commit_sha,
        "job_id": job.id,
        "export_meta": meta,
    }


@router.get("/github/jobs")
def github_jobs(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    rows = session.exec(select(PushJob).where(PushJob.org_id == org_id)).all()
    return sorted(rows, key=lambda r: r.id or 0, reverse=True)


# ---- Asset submissions (org review) ----


class AssetItemDecisionIn(BaseModel):
    id: int
    action: str = "skip"  # accept|skip
    target_status: str = "trial"  # trial|enforced


class AssetSubmissionDecideIn(BaseModel):
    decision: str  # approve|reject
    note: str = ""
    items: list[AssetItemDecisionIn] = Field(default_factory=list)


class AssetStatusIn(BaseModel):
    status: str  # trial|enforced


OrgAdmin = Annotated[User, Depends(require_roles("org_admin"))]


@router.get("/asset-submissions")
def list_asset_submissions(
    session: SessionDep,
    _admin: OrgAdmin,
    status: Optional[str] = None,
    org_id: str = "default",
):
    q = select(AssetSubmission).where(AssetSubmission.org_id == org_id)
    if status:
        q = q.where(AssetSubmission.status == status)
    rows = session.exec(q).all()
    rows = sorted(rows, key=lambda r: r.id or 0, reverse=True)
    return [submission_payload(session, r) for r in rows]


@router.get("/asset-submissions/{submission_id}")
def get_asset_submission(submission_id: int, session: SessionDep, _admin: OrgAdmin):
    row = session.get(AssetSubmission, submission_id)
    if not row:
        raise HTTPException(404)
    return submission_payload(session, row)


@router.post("/asset-submissions/{submission_id}/decide")
def decide_asset_submission(
    submission_id: int,
    body: AssetSubmissionDecideIn,
    session: SessionDep,
    admin: OrgAdmin,
):
    row = session.get(AssetSubmission, submission_id)
    if not row:
        raise HTTPException(404)
    result = decide_submission(
        session,
        row,
        decision=body.decision,
        note=body.note,
        item_decisions=[i.model_dump() for i in body.items],
        decided_by=admin.username or admin.display_name or "",
    )
    write_org_log(
        session,
        admin,
        "asset_submission_decide",
        f"审批资产提交 #{submission_id}：{body.decision}",
        detail={"submission_id": submission_id, "decision": body.decision, "note": body.note, "items": [i.model_dump() for i in body.items]},
        org_id=row.org_id,
    )
    return result


@router.patch("/guides/{guide_id}/status")
def patch_guide_status(guide_id: int, body: AssetStatusIn, session: SessionDep, admin: OrgAdmin):
    result = set_asset_status(session, asset_type="guide", row_id=guide_id, status=body.status)
    write_org_log(
        session,
        admin,
        "guide_status",
        f"更新 Guide 状态 #{guide_id} → {body.status}",
        detail=result,
        org_id="default",
    )
    return result


@router.patch("/sensors/{sensor_id}/status")
def patch_sensor_status(sensor_id: int, body: AssetStatusIn, session: SessionDep, admin: OrgAdmin):
    result = set_asset_status(session, asset_type="sensor", row_id=sensor_id, status=body.status)
    write_org_log(
        session,
        admin,
        "sensor_status",
        f"更新 Check 状态 #{sensor_id} → {body.status}",
        detail=result,
        org_id="default",
    )
    return result
