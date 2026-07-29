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
    content: str = ""
    content_mode: str = "markdown"  # text|markdown|package


ASSET_NAME_MAX = 20


def _normalize_asset_name(name: str | None, asset_id: str) -> str:
    cleaned = (name or "").strip()
    if len(cleaned) > ASSET_NAME_MAX:
        raise HTTPException(400, f"名称不能超过 {ASSET_NAME_MAX} 个字")
    if cleaned:
        return cleaned
    return (asset_id or "").strip()[:ASSET_NAME_MAX]


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


GUIDE_KINDS = {
    "guide.skill",
    "guide.template",
    "guide.constraint",
    "guide.exemplar",
    "guide.scaffold",
    "guide.codemod",
    "guide.glossary",
    "guide.capability",
}


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


@router.post("/bootstrap")
def bootstrap(body: BootstrapIn, session: SessionDep, _user: CurrentUser) -> dict[str, Any]:
    return bootstrap_org(session, org_id=body.org_id, org_name=body.org_name)


@router.get("/settings")
def get_settings_api(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    return _settings_or_404(session, org_id)


@router.put("/settings")
def put_settings(body: OrgSettingsIn, session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    row = _settings_or_404(session, org_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


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
def create_profile(body: ProfileIn, session: SessionDep, _user: CurrentUser, org_id: str = "default"):
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
    return _profile_payload(session, row)


@router.put("/profiles/{profile_id}")
def update_profile(profile_id: int, body: ProfileIn, session: SessionDep, _user: CurrentUser):
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
    return _profile_payload(session, row)


@router.delete("/profiles/{profile_id}")
def delete_profile(profile_id: int, session: SessionDep, _user: CurrentUser):
    row = session.get(Profile, profile_id)
    if not row:
        raise HTTPException(404)
    if row.key in _BUILTIN_PROFILE_KEYS:
        raise HTTPException(400, f"内置 Profile「{row.key}」不可删除")
    for t in session.exec(
        select(StageTask).where(StageTask.org_id == row.org_id, StageTask.profile_key == row.key)
    ).all():
        session.delete(t)
    session.delete(row)
    session.commit()
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
def create_task(body: StageTaskIn, session: SessionDep, _user: CurrentUser, org_id: str = "default"):
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
    session.commit()
    session.refresh(row)
    return row


@router.put("/tasks/{task_row_id}")
def update_task(task_row_id: int, body: StageTaskIn, session: SessionDep, _user: CurrentUser):
    row = session.get(StageTask, task_row_id)
    if not row:
        raise HTTPException(404)
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
    session.commit()
    session.refresh(row)
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
    }


@router.delete("/tasks/{task_row_id}")
def delete_task(task_row_id: int, session: SessionDep, _user: CurrentUser):
    row = session.get(StageTask, task_row_id)
    if not row:
        raise HTTPException(404)
    session.delete(row)
    session.commit()
    return {"ok": True}


# ---- Guides / Sensors / Commands ----


@router.get("/guides")
def list_guides(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    return session.exec(select(Guide).where(Guide.org_id == org_id)).all()


@router.post("/guides")
def create_guide(body: GuideIn, session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    if body.kind not in GUIDE_KINDS:
        raise HTTPException(400, f"unsupported guide kind: {body.kind}")
    mode = body.content_mode if body.content_mode in ("text", "markdown", "package") else "markdown"
    row = Guide(
        org_id=org_id,
        asset_id=body.asset_id,
        name=_normalize_asset_name(body.name, body.asset_id),
        kind=body.kind,
        stage=body.stage,
        task=body.task,
        version=body.version,
        status=body.status,
        content=body.content,
        content_mode=mode,
        package_path="",
        package_files_json="[]",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.put("/guides/{guide_id}")
def update_guide(guide_id: int, body: GuideIn, session: SessionDep, _user: CurrentUser):
    row = session.get(Guide, guide_id)
    if not row:
        raise HTTPException(404)
    if body.kind not in GUIDE_KINDS:
        raise HTTPException(400, f"unsupported guide kind: {body.kind}")
    mode = body.content_mode if body.content_mode in ("text", "markdown", "package") else "markdown"
    row.asset_id = body.asset_id
    row.name = _normalize_asset_name(body.name, body.asset_id)
    row.kind = body.kind
    row.stage = body.stage
    row.task = body.task
    row.version = body.version
    row.status = body.status
    row.content = body.content
    row.content_mode = mode
    if mode != "package":
        # keep package on disk but clear pointer when switching to inline
        row.package_path = ""
        row.package_files_json = "[]"
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.post("/guides/upload")
async def upload_guide(
    session: SessionDep,
    _user: CurrentUser,
    asset_id: str = Form(...),
    name: str = Form(""),
    kind: str = Form("guide.skill"),
    stage: str = Form(""),
    task: str = Form(""),
    version: str = Form("1.0.0"),
    status: str = Form("draft"),
    org_id: str = Form("default"),
    guide_id: Optional[int] = Form(None),
    files: list[UploadFile] = File(default_factory=list),
    relative_paths: list[str] = Form(default_factory=list),
):
    """Create/update a Guide from uploaded file(s) or folder (multipart)."""
    if kind not in GUIDE_KINDS:
        raise HTTPException(400, f"unsupported guide kind: {kind}")
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
    else:
        row = Guide(org_id=org_id)

    row.asset_id = asset_id.strip()
    row.name = _normalize_asset_name(name, row.asset_id)
    row.kind = kind
    row.stage = stage
    row.task = task
    row.version = version.strip() or "1.0.0"
    row.status = status
    row.content = content
    row.content_mode = "package"
    row.package_path = pkg_rel
    row.package_files_json = json.dumps(saved, ensure_ascii=False)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


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
def create_guide_from_github(body: GuideFromGithubIn, session: SessionDep, _user: CurrentUser):
    """Download a skill directory from GitHub and install as guide.skill package."""
    try:
        return _install_guide_from_github(
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
def create_guides_from_github_batch(body: GuideFromGithubBatchIn, session: SessionDep, _user: CurrentUser):
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
    files: list[str] = []
    try:
        files = json.loads(row.package_files_json or "[]")
    except json.JSONDecodeError:
        files = []
    if row.package_path:
        try:
            root = _guide_package_root(row)
            disk = sorted(
                str(p.relative_to(root)).replace("\\", "/")
                for p in root.rglob("*")
                if p.is_file()
            )
            if disk:
                files = disk
        except HTTPException:
            pass
    return {
        "id": row.id,
        "asset_id": row.asset_id,
        "package_path": row.package_path or "",
        "content_mode": row.content_mode,
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
    root = _guide_package_root(row)
    target = (root / rel).resolve()
    if not str(target).startswith(str(root)) or not target.is_file():
        raise HTTPException(404, "file not found")
    data = target.read_bytes()
    ctype, _ = mimetypes.guess_type(str(target))
    return Response(
        content=data,
        media_type=ctype or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{target.name}"'},
    )


@router.delete("/guides/{guide_id}")
def delete_guide(guide_id: int, session: SessionDep, _user: CurrentUser):
    row = session.get(Guide, guide_id)
    if not row:
        raise HTTPException(404)
    session.delete(row)
    session.commit()
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
def create_sensor(body: SensorIn, session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    data = _sensor_row_fields(body)
    row = Sensor(org_id=org_id, **data)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.put("/sensors/{sensor_id}")
def update_sensor(sensor_id: int, body: SensorIn, session: SessionDep, _user: CurrentUser):
    row = session.get(Sensor, sensor_id)
    if not row:
        raise HTTPException(404)
    data = _sensor_row_fields(body)
    for k, v in data.items():
        setattr(row, k, v)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/sensors/{sensor_id}")
def delete_sensor(sensor_id: int, session: SessionDep, _user: CurrentUser):
    row = session.get(Sensor, sensor_id)
    if not row:
        raise HTTPException(404)
    session.delete(row)
    session.commit()
    return {"ok": True}


@router.get("/commands")
def list_commands(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    return session.exec(select(CommandShell).where(CommandShell.org_id == org_id)).all()


@router.post("/commands")
def create_command(body: CommandIn, session: SessionDep, _user: CurrentUser, org_id: str = "default"):
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
    return row


@router.put("/commands/{command_id}")
def update_command(command_id: int, body: CommandIn, session: SessionDep, _user: CurrentUser):
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
    return row


@router.delete("/commands/{command_id}")
def delete_command(command_id: int, session: SessionDep, _user: CurrentUser):
    row = session.get(CommandShell, command_id)
    if not row:
        raise HTTPException(404)
    session.delete(row)
    session.commit()
    return {"ok": True}


# ---- Export / GitHub ----


@router.post("/export-hub")
def export_hub_api(session: SessionDep, _user: CurrentUser, org_id: str = "default"):
    settings = get_settings()
    dest = settings.hubs_dir / org_id
    meta = export_hub(session, org_id, dest)
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
    _user: CurrentUser,
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
    return decide_submission(
        session,
        row,
        decision=body.decision,
        note=body.note,
        item_decisions=[i.model_dump() for i in body.items],
        decided_by=admin.username or admin.display_name or "",
    )


@router.patch("/guides/{guide_id}/status")
def patch_guide_status(guide_id: int, body: AssetStatusIn, session: SessionDep, _admin: OrgAdmin):
    return set_asset_status(session, asset_type="guide", row_id=guide_id, status=body.status)


@router.patch("/sensors/{sensor_id}/status")
def patch_sensor_status(sensor_id: int, body: AssetStatusIn, session: SessionDep, _admin: OrgAdmin):
    return set_asset_status(session, asset_type="sensor", row_id=sensor_id, status=body.status)
