from __future__ import annotations

import json
import mimetypes
import re
import shutil
from datetime import datetime, timezone
from datetime import timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlmodel import select

from app.core.config import get_settings
from app.core.deps import CurrentUser, SessionDep
from app.core.models import (
    Artifact,
    ArtifactVersion,
    AssetSubmission,
    AssetSubmissionItem,
    CommandShell,
    Guide,
    OrgSettings,
    Project,
    ProjectGuide,
    ProjectMember,
    ProjectOperationLog,
    ProjectSensor,
    ProjectSuite,
    ProjectTask,
    TaskShellRunLog,
    SyncJob,
    Ticket,
    User,
)
from app.domain.asset_submission import create_submission, list_promotable, submission_payload
from app.domain.custom_task import (
    delete_task_shells,
    ensure_task_shells,
    list_project_stage_options,
)
from app.domain.guide_package import (
    content_disposition_inline,
    content_fallback_for_path,
    merge_package_file_list,
    package_files_json_dumps,
    pick_primary_content,
    resolve_package_root,
    write_guide_package,
    write_single_package_file,
)
from app.domain.project_materializer import (
    advance_project_cursor,
    build_project_hx_view,
    export_project_for_cli,
    heal_current_stage_from_shell_logs,
    materialize_project_config,
    sync_project_from_org,
)
from app.domain.project_progress import build_project_progress
from app.domain.project_oplog import summarize_sync_changes, sync_change_count, write_project_log
from app.domain.ref_skills import (
    normalize_ref_skills,
    parse_ref_skills_json,
    parse_ref_skills_raw,
    ref_skills_to_json,
)
from app.domain.shell_assembler import assemble_shell
from app.domain import defaults
from app.services import github as github_svc

router = APIRouter(prefix="/api", tags=["project"])


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9\-]+", "-", name.strip().lower()).strip("-")
    return s or "project"


def _role_set(roles: str) -> set[str]:
    return {r.strip() for r in (roles or "").split(",") if r.strip()}


def _is_org_admin(user: User) -> bool:
    return "org_admin" in _role_set(user.roles)


def _can_create_project(user: User) -> bool:
    roles = _role_set(user.roles)
    return "org_admin" in roles or "project_owner" in roles


def _require_project_member(session: SessionDep, user: User, project_id: int) -> None:
    if _is_org_admin(user):
        return
    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "未加入该项目，请联系项目管理者添加成员")


def _require_project_manager(session: SessionDep, user: User, project_id: int) -> None:
    if _is_org_admin(user):
        return
    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    ).first()
    if not member or member.role != "project_owner":
        raise HTTPException(403, "仅项目管理者可执行该操作")


def _can_manage_project(session: SessionDep, user: User, project_id: int) -> bool:
    """org_admin or project member with project_owner role."""
    if _is_org_admin(user):
        return True
    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    ).first()
    return bool(member and member.role == "project_owner")


def _can_delete_project(user: User, project: Project) -> bool:
    if _is_org_admin(user):
        return True
    return project.created_by_user_id is not None and project.created_by_user_id == user.id


def _project_public_dict(project: Project) -> dict[str, Any]:
    data = project.model_dump()
    data.pop("github_token", None)
    data["github_token_configured"] = bool((project.github_token or "").strip())
    return data


def _purge_project(session: SessionDep, project_id: int) -> None:
    for art in session.exec(select(Artifact).where(Artifact.project_id == project_id)).all():
        for ver in session.exec(select(ArtifactVersion).where(ArtifactVersion.artifact_id == art.id)).all():
            session.delete(ver)
        session.delete(art)
    for sub in session.exec(select(AssetSubmission).where(AssetSubmission.project_id == project_id)).all():
        for item in session.exec(
            select(AssetSubmissionItem).where(AssetSubmissionItem.submission_id == sub.id)
        ).all():
            session.delete(item)
        session.delete(sub)
    for model in (
        ProjectMember,
        ProjectGuide,
        ProjectSensor,
        ProjectTask,
        ProjectSuite,
        Ticket,
        SyncJob,
        ProjectOperationLog,
    ):
        for row in session.exec(select(model).where(model.project_id == project_id)).all():
            session.delete(row)
    row = session.get(Project, project_id)
    if row:
        session.delete(row)


class ProjectIn(BaseModel):
    name: str
    slug: Optional[str] = None
    profile_key: str = "standard"
    github_repo: str = ""
    github_branch: str = "main"
    github_token: Optional[str] = None
    clear_github_token: bool = False
    description: str = ""


class MemberIn(BaseModel):
    user_id: int
    role: str = "member"


class ProjectAssetIn(BaseModel):
    asset_id: str
    name: str = ""
    kind: str = "guide.skill"
    stage: str = ""
    task: str = ""
    content: str = ""
    status: str = "draft"
    content_mode: str = "markdown"
    version: str = "1.0.0"
    ref_skills: list[str] = Field(default_factory=list)
    check_type: str = "rules"
    triggers: list[str] = Field(default_factory=lambda: ["hook:stop", "cli", "task-shell"])
    scope: list[str] = Field(default_factory=list)


class ProjectGuideUpdateIn(BaseModel):
    asset_id: Optional[str] = None
    name: Optional[str] = None
    kind: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    content_mode: Optional[str] = None
    version: Optional[str] = None
    ref_skills: Optional[list[str]] = None


class ProjectGuideFromGithubIn(BaseModel):
    repo: str
    skill_path: str
    asset_id: Optional[str] = None
    version: str = "1.0.0"
    status: str = "draft"
    guide_id: Optional[int] = None
    ref: Optional[str] = None


class ProjectGuideFromGithubSkillItem(BaseModel):
    skill_path: str
    asset_id: Optional[str] = None


class ProjectGuideFromGithubBatchIn(BaseModel):
    repo: str
    skills: list[ProjectGuideFromGithubSkillItem]
    version: str = "1.0.0"
    status: str = "draft"
    ref: Optional[str] = None


ASSET_NAME_MAX = 20


def _normalize_asset_name(name: str | None, asset_id: str) -> str:
    cleaned = (name or "").strip()
    if len(cleaned) > ASSET_NAME_MAX:
        raise HTTPException(400, f"名称不能超过 {ASSET_NAME_MAX} 个字")
    if cleaned:
        return cleaned
    return (asset_id or "").strip()[:ASSET_NAME_MAX]


def _normalize_content_mode(mode: str | None, *, fallback: str = "markdown") -> str:
    m = (mode or "").strip()
    if m in ("text", "markdown", "package"):
        return m
    return fallback


def _project_github_token(session: SessionDep, project_id: int) -> str:
    """Prefer project token, then org Settings, then env (same as project GitHub sync)."""
    project = session.get(Project, project_id)
    project_token = ((project.github_token if project else None) or "").strip()
    if project_token:
        return project_token
    org = session.exec(select(OrgSettings).where(OrgSettings.org_id == "default")).first()
    org_token = ((org.github_token if org else None) or "").strip()
    if org_token:
        return org_token
    return (get_settings().github_token or "").strip()


def _parse_repo_or_400(repo: str) -> tuple[str, str]:
    parsed = github_svc.parse_github_owner_repo(repo)
    if not parsed:
        raise HTTPException(400, "无效的仓库名，请使用 owner/repo 或 https://github.com/owner/repo")
    return parsed


def _require_editable_project_guide(session: SessionDep, project_id: int, guide_id: int) -> ProjectGuide:
    row = session.get(ProjectGuide, guide_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    data = _enrich_project_guide(session, row)
    if not data.get("editable"):
        raise HTTPException(400, "来自组织 HX 的 Guide 不可编辑，请在组织侧维护")
    return row


def _project_package_scope(project_id: int) -> str:
    return f"project/{project_id}"


def _project_skill_asset_ids(session: SessionDep, project_id: int) -> set[str]:
    rows = session.exec(
        select(ProjectGuide).where(
            ProjectGuide.project_id == project_id,
            ProjectGuide.kind == "guide.skill",
        )
    ).all()
    return {g.asset_id for g in rows if g.asset_id}


def _resolve_project_ref_skills(
    session: SessionDep,
    project_id: int,
    *,
    kind: str,
    asset_id: str,
    refs: list[str] | None,
) -> list[str]:
    return normalize_ref_skills(
        refs or [],
        kind=kind,
        self_asset_id=asset_id,
        allowed_skill_ids=_project_skill_asset_ids(session, project_id),
    )


class CustomTaskIn(BaseModel):
    stage: str
    task_id: str
    title: str = ""
    required: bool = False
    guides: list[str] = Field(default_factory=list)
    sensors: list[str] = Field(default_factory=list)

class ProjectTaskUpdateIn(BaseModel):
    title: Optional[str] = None
    required: Optional[bool] = None
    guides: Optional[list[str]] = None
    sensors: Optional[list[str]] = None


class TicketIn(BaseModel):
    project_id: int
    title: str
    ticket_type: str = "req-review"
    body: str = ""
    assignee_role: str = "approver"
    stage: str = ""
    task: str = ""
    artifact_name: str = ""


class TicketDecisionIn(BaseModel):
    note: str = ""


class TaskShellRunIn(BaseModel):
    stage: str
    task_id: str
    trigger_mode: str = "command"  # command|skill
    ide: str = "unknown"


IDE_NORMALIZE_MAP = {
    "cursor": "cursor",
    "trae": "trae",
    "trae-cn": "trae-cn",
    "codebuddy": "codebuddy",
    "workbuddy": "workbuddy",
    "unknown": "unknown",
}


def normalize_ide_name(ide: str) -> str:
    raw = (ide or "").strip().lower()
    if not raw:
        return "unknown"
    return IDE_NORMALIZE_MAP.get(raw, "unknown")


# ---- Users (for member picker) ----


@router.get("/users")
def list_users(session: SessionDep, _user: CurrentUser):
    rows = session.exec(select(User).where(User.is_active == True)).all()  # noqa: E712
    return [{"id": u.id, "username": u.username, "display_name": u.display_name, "roles": u.roles} for u in rows]


# ---- Dashboard ----


def _as_utc(dt: datetime | None) -> datetime | None:
    """Normalize SQLite-naive datetimes for safe comparison with aware UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _usage_series_30d(
    run_rows: list[Any],
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Build last-30-calendar-day (incl. today) series for users and runs."""
    today = now.astimezone(timezone.utc).date()
    day_keys = [today - timedelta(days=i) for i in range(29, -1, -1)]
    users_by_day: dict[Any, set[str]] = {d: set() for d in day_keys}
    count_by_day: dict[Any, int] = {d: 0 for d in day_keys}
    for r in run_rows:
        at = _as_utc(getattr(r, "run_at", None))
        if at is None:
            continue
        d = at.date()
        if d not in count_by_day:
            continue
        count_by_day[d] += 1
        uname = (getattr(r, "runner_username", None) or "").strip()
        if uname:
            users_by_day[d].add(uname)
    user_series = [{"date": d.isoformat(), "value": len(users_by_day[d])} for d in day_keys]
    count_series = [{"date": d.isoformat(), "value": count_by_day[d]} for d in day_keys]
    return user_series, count_series


@router.get("/project/dashboard")
def project_dashboard(session: SessionDep, _user: CurrentUser) -> dict[str, Any]:
    projects = session.exec(select(Project)).all()
    pending = session.exec(select(Ticket).where(Ticket.status == "submitted")).all()
    artifacts = session.exec(select(Artifact)).all()
    versions = session.exec(select(ArtifactVersion)).all()
    now = datetime.now(timezone.utc)
    recent_since = now - timedelta(days=30)
    run_rows = session.exec(select(TaskShellRunLog)).all()
    recent_run_rows = [
        r for r in run_rows if (_as_utc(r.run_at) or now) >= recent_since
    ]
    total_users = {
        (r.runner_username or "").strip()
        for r in run_rows
        if (r.runner_username or "").strip()
    }
    recent_users = {
        (r.runner_username or "").strip()
        for r in recent_run_rows
        if (r.runner_username or "").strip()
    }
    user_series, count_series = _usage_series_30d(list(run_rows), now)
    return {
        "project_count": len(projects),
        "pending_tickets": len(pending),
        "artifact_count": len(artifacts),
        "version_count": len(versions),
        "shell_run_count_total": len(run_rows),
        "shell_run_count_30d": len(recent_run_rows),
        "shell_run_user_count_total": len(total_users),
        "shell_run_user_count_30d": len(recent_users),
        "shell_run_window_days": 30,
        "shell_run_user_series_30d": user_series,
        "shell_run_count_series_30d": count_series,
        "recent_tickets": pending[:5],
        "projects": projects,
    }


@router.post("/projects/{project_id}/task-shell-runs")
def report_task_shell_run(
    project_id: int,
    body: TaskShellRunIn,
    session: SessionDep,
    user: CurrentUser,
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    _require_project_member(session, user, project_id)
    stage = (body.stage or "").strip()
    task_id = (body.task_id or "").strip()
    if not stage or not task_id:
        raise HTTPException(400, "stage and task_id are required")
    mode = (body.trigger_mode or "command").strip().lower()
    if mode not in ("command", "skill"):
        mode = "command"
    ide = normalize_ide_name(body.ide or "unknown")
    runner = (user.username or "").strip()
    recent_cutoff = datetime.now(timezone.utc) - timedelta(seconds=45)
    recent = session.exec(
        select(TaskShellRunLog).where(
            TaskShellRunLog.project_id == project_id,
            TaskShellRunLog.stage == stage,
            TaskShellRunLog.task_id == task_id,
            TaskShellRunLog.runner_username == runner,
            TaskShellRunLog.ide == ide,
            TaskShellRunLog.run_at >= recent_cutoff,
        )
    ).first()
    if recent:
        return {
            "ok": True,
            "deduped": True,
            "id": recent.id,
            "current_stage": project.current_stage,
            "current_task": getattr(project, "current_task", None) or "",
        }
    row = TaskShellRunLog(
        project_id=project_id,
        stage=stage,
        task_id=task_id,
        runner_username=runner,
        trigger_mode=mode,
        ide=ide,
        source="nhx",
    )
    session.add(row)
    advance_project_cursor(session, project, stage, task_id)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        "task_shell_run",
        f"执行任务壳 {stage}/{task_id}",
        {
            "stage": stage,
            "task_id": task_id,
            "trigger_mode": mode,
            "ide": ide,
            "source": "nhx",
            "run_id": row.id,
        },
    )
    return {
        "ok": True,
        "id": row.id,
        "current_stage": project.current_stage,
        "current_task": getattr(project, "current_task", None) or "",
    }


# ---- Projects ----


@router.get("/projects")
def list_projects(session: SessionDep, user: CurrentUser):
    if _is_org_admin(user):
        projects = session.exec(select(Project)).all()
    else:
        memberships = session.exec(select(ProjectMember).where(ProjectMember.user_id == user.id)).all()
        pids = {m.project_id for m in memberships}
        projects = [p for p in session.exec(select(Project)).all() if p.id in pids]
    out = []
    healed = False
    for p in projects:
        if heal_current_stage_from_shell_logs(session, p):
            healed = True
        members = session.exec(select(ProjectMember).where(ProjectMember.project_id == p.id)).all()
        arts = session.exec(select(Artifact).where(Artifact.project_id == p.id)).all()
        hx = build_project_hx_view(session, p)
        progress = build_project_progress(session, p)
        out.append(
            {
                **_project_public_dict(p),
                "member_count": len(members),
                "artifact_count": len(arts),
                "config": json.loads(p.config_json or "{}"),
                "hx_counts": hx.get("counts") or {},
                "initialized": (hx.get("counts") or {}).get("tasks", 0) > 0,
                "can_delete": _can_delete_project(user, p),
                "progress": progress,
                "completed_stages": progress["completed_stages"],
                "completed_tasks": progress["completed_tasks"],
                "current_task": progress["current_task"],
                "current_task_title": progress["current_task_title"],
            }
        )
    if healed:
        session.commit()
    return out


@router.post("/projects")
def create_project(body: ProjectIn, session: SessionDep, user: CurrentUser):
    if not _can_create_project(user):
        raise HTTPException(403, "仅组织管理者或项目管理者可新建项目")
    slug = body.slug or _slugify(body.name)
    if session.exec(select(Project).where(Project.slug == slug)).first():
        raise HTTPException(400, f"slug {slug} exists")
    row = Project(
        name=body.name,
        slug=slug,
        profile_key=body.profile_key,
        github_repo=body.github_repo,
        github_branch=body.github_branch or "main",
        github_token=(body.github_token or "").strip(),
        description=body.description,
        created_by_user_id=user.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    session.add(ProjectMember(project_id=row.id, user_id=user.id, role="project_owner"))
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        row.id,
        user,
        "project_create",
        f"创建项目 {row.name}",
        {"slug": row.slug, "profile_key": row.profile_key},
    )
    return _project_public_dict(row)


@router.get("/projects/{project_id}")
def get_project(project_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(Project, project_id)
    if not row:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    if heal_current_stage_from_shell_logs(session, row):
        session.commit()
        session.refresh(row)
    members = session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
    member_view = []
    for m in members:
        u = session.get(User, m.user_id)
        member_view.append(
            {
                "id": m.id,
                "user_id": m.user_id,
                "role": m.role,
                "username": u.username if u else "",
                "display_name": u.display_name if u else "",
            }
        )
    hx_config = build_project_hx_view(session, row)
    progress = build_project_progress(session, row)
    return {
        **_project_public_dict(row),
        "config": json.loads(row.config_json or "{}"),
        "hx_config": hx_config,
        "members": member_view,
        "progress": progress,
        "completed_stages": progress["completed_stages"],
        "completed_tasks": progress["completed_tasks"],
        "current_task": progress["current_task"],
        "current_task_title": progress["current_task_title"],
    }


@router.put("/projects/{project_id}")
def update_project(project_id: int, body: ProjectIn, session: SessionDep, user: CurrentUser):
    row = session.get(Project, project_id)
    if not row:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    before = {
        "name": row.name,
        "profile_key": row.profile_key,
        "github_repo": row.github_repo,
        "github_branch": row.github_branch,
        "description": row.description,
        "github_token_configured": bool((row.github_token or "").strip()),
    }
    row.name = body.name
    row.profile_key = body.profile_key
    row.github_repo = body.github_repo
    row.github_branch = body.github_branch or "main"
    row.description = body.description
    if body.clear_github_token:
        row.github_token = ""
    elif body.github_token is not None and body.github_token.strip():
        row.github_token = body.github_token.strip()
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    after = {
        "name": row.name,
        "profile_key": row.profile_key,
        "github_repo": row.github_repo,
        "github_branch": row.github_branch,
        "description": row.description,
        "github_token_configured": bool((row.github_token or "").strip()),
    }
    write_project_log(
        session,
        project_id,
        user,
        "project_update",
        f"更新项目元数据 {row.name}",
        {"before": before, "after": after},
    )
    return _project_public_dict(row)


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(Project, project_id)
    if not row:
        raise HTTPException(404)
    if not _can_delete_project(user, row):
        raise HTTPException(403, "仅组织管理者或项目创建者可删除")
    _purge_project(session, project_id)
    session.commit()
    return {"ok": True}


@router.post("/projects/{project_id}/init-config")
def init_config(project_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(Project, project_id)
    if not row:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    try:
        config = materialize_project_config(session, row)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    counts = (config or {}).get("counts") or {}
    write_project_log(
        session,
        project_id,
        user,
        "init_config",
        f"初始化配置：{counts.get('stages', 0)} stage / {counts.get('tasks', 0)} task / "
        f"{counts.get('guides', 0)} guide / {counts.get('sensors', 0)} sensor",
        {"counts": counts},
    )
    return {"ok": True, "config": config, "hx_config": config}


@router.post("/projects/{project_id}/sync-config")
def sync_config(project_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(Project, project_id)
    if not row:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    try:
        result = sync_project_from_org(session, row)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    changes = result.get("changes") or {}
    summary = summarize_sync_changes(changes)
    write_project_log(
        session,
        project_id,
        user,
        "sync_config",
        f"同步组织 HX：{summary}",
        {"changes": changes},
    )
    return {
        "ok": True,
        "changes": changes,
        "change_count": sync_change_count(changes),
        "summary": summary,
        "config": result.get("config"),
        "hx_config": result.get("hx_config"),
    }


@router.get("/projects/{project_id}/operation-logs")
def list_operation_logs(
    project_id: int,
    session: SessionDep,
    user: CurrentUser,
    limit: int = 50,
    offset: int = 0,
):
    if not session.get(Project, project_id):
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    rows = session.exec(
        select(ProjectOperationLog).where(ProjectOperationLog.project_id == project_id)
    ).all()
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
                "created_at": _as_utc(r.created_at).isoformat().replace("+00:00", "Z")
                if _as_utc(r.created_at)
                else r.created_at,
                "detail": detail,
            }
        )
    return {"total": len(rows_sorted), "items": out}


@router.get("/projects/{project_id}/members")
def list_members(project_id: int, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    members = session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
    out = []
    for m in members:
        u = session.get(User, m.user_id)
        out.append(
            {
                "id": m.id,
                "user_id": m.user_id,
                "role": m.role,
                "username": u.username if u else "",
                "display_name": u.display_name if u else "",
            }
        )
    return out


@router.post("/projects/{project_id}/members")
def add_member(project_id: int, body: MemberIn, session: SessionDep, user: CurrentUser):
    if not session.get(Project, project_id):
        raise HTTPException(404, "project not found")
    _require_project_manager(session, user, project_id)
    target = session.get(User, body.user_id)
    if not target:
        raise HTTPException(404, "user not found")
    exists = session.exec(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == body.user_id)
    ).first()
    if exists:
        exists.role = body.role
        session.add(exists)
        session.commit()
        write_project_log(
            session,
            project_id,
            user,
            "member_update",
            f"更新成员 {target.username} 角色为 {body.role}",
            {"user_id": body.user_id, "username": target.username, "role": body.role},
        )
        return exists
    row = ProjectMember(project_id=project_id, user_id=body.user_id, role=body.role)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        "member_add",
        f"添加成员 {target.username}（{body.role}）",
        {"user_id": body.user_id, "username": target.username, "role": body.role},
    )
    return row


@router.delete("/projects/{project_id}/members/{member_id}")
def remove_member(project_id: int, member_id: int, session: SessionDep, user: CurrentUser):
    _require_project_manager(session, user, project_id)
    row = session.get(ProjectMember, member_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    target = session.get(User, row.user_id)
    uname = target.username if target else str(row.user_id)
    session.delete(row)
    session.commit()
    write_project_log(
        session,
        project_id,
        user,
        "member_remove",
        f"移除成员 {uname}",
        {"user_id": row.user_id, "username": uname, "role": row.role},
    )
    return {"ok": True}


# ---- Project custom assets ----


def _project_asset_bindings(session: SessionDep, project_id: int) -> tuple[dict[str, list[dict[str, str]]], dict[str, list[dict[str, str]]]]:
    """Map asset_id → [{stage, task, title}] from ProjectTask bindings."""
    guide_map: dict[str, list[dict[str, str]]] = {}
    sensor_map: dict[str, list[dict[str, str]]] = {}
    for t in session.exec(select(ProjectTask).where(ProjectTask.project_id == project_id)).all():
        link = {
            "stage": t.stage or "",
            "task": t.task_id or "",
            "title": t.title or t.task_id or "",
        }
        try:
            gids = json.loads(t.guides_json or "[]")
        except json.JSONDecodeError:
            gids = []
        try:
            sids = json.loads(t.sensors_json or "[]")
        except json.JSONDecodeError:
            sids = []
        for gid in gids:
            if not gid:
                continue
            guide_map.setdefault(str(gid), []).append(link)
        for sid in sids:
            if not sid:
                continue
            sensor_map.setdefault(str(sid), []).append(link)
    return guide_map, sensor_map


def _merge_row_stage_task(
    bindings: list[dict[str, str]],
    stage: str,
    task: str,
) -> list[dict[str, str]]:
    """Include row.stage/task if set and not already covered by task bindings."""
    out = list(bindings or [])
    st = (stage or "").strip()
    tk = (task or "").strip()
    if not st and not tk:
        return out
    key = (st, tk)
    existing = {(b.get("stage") or "", b.get("task") or "") for b in out}
    if key not in existing:
        out.append({"stage": st, "task": tk, "title": tk})
    return out


def _enrich_project_guide(
    session: SessionDep,
    row: ProjectGuide,
    org_by_aid: dict[str, Guide] | None = None,
    guide_bindings: dict[str, list[dict[str, str]]] | None = None,
) -> dict[str, Any]:
    if org_by_aid is None:
        org_by_aid = {
            g.asset_id: g
            for g in session.exec(select(Guide).where(Guide.org_id == "default")).all()
        }
    d = row.model_dump()
    source = (getattr(row, "source", None) or "").strip()
    og = org_by_aid.get(row.asset_id)
    # Backfill legacy rows without source
    if not source:
        source = "org" if og else "project"
        if source != (getattr(row, "source", None) or ""):
            row.source = source
            session.add(row)
    d["source"] = source
    d["editable"] = source == "project"
    status = (getattr(row, "status", None) or "").strip()
    if source == "org" and og:
        d["status"] = og.status or status or "draft"
        d["version"] = og.version or getattr(row, "version", None) or "1.0.0"
        d["content_mode"] = og.content_mode or getattr(row, "content_mode", None) or "markdown"
        d["package_path"] = og.package_path or ""
        d["package_files_json"] = og.package_files_json or "[]"
        d["org_guide_id"] = og.id
        d["content"] = og.content if og.content else row.content
        d["ref_skills"] = parse_ref_skills_json(getattr(og, "ref_skills_json", None))
    else:
        d["status"] = status or "draft"
        d["version"] = getattr(row, "version", None) or "1.0.0"
        d["content_mode"] = getattr(row, "content_mode", None) or "markdown"
        d["package_path"] = getattr(row, "package_path", None) or ""
        d["package_files_json"] = getattr(row, "package_files_json", None) or "[]"
        d["org_guide_id"] = None
        d["ref_skills"] = parse_ref_skills_json(getattr(row, "ref_skills_json", None))
    binds = (guide_bindings or {}).get(row.asset_id, []) if guide_bindings is not None else []
    if guide_bindings is None:
        gmap, _ = _project_asset_bindings(session, row.project_id)
        binds = gmap.get(row.asset_id, [])
    d["bindings"] = _merge_row_stage_task(binds, row.stage or "", row.task or "")
    d["linked_stages"] = sorted({b["stage"] for b in d["bindings"] if b.get("stage")})
    d["linked_tasks"] = sorted(
        {
            f"{b['stage']}/{b['task']}" if b.get("stage") and b.get("task") else (b.get("task") or b.get("stage") or "")
            for b in d["bindings"]
            if b.get("stage") or b.get("task")
        }
    )
    return d


@router.get("/projects/{project_id}/guides")
def list_project_guides(project_id: int, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    rows = session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project_id)).all()
    org_by_aid = {
        g.asset_id: g for g in session.exec(select(Guide).where(Guide.org_id == "default")).all()
    }
    guide_bindings, _ = _project_asset_bindings(session, project_id)
    out = [_enrich_project_guide(session, r, org_by_aid, guide_bindings) for r in rows]
    session.commit()  # persist source backfill if any
    return out


@router.get("/projects/{project_id}/guides/{guide_id}")
def get_project_guide(project_id: int, guide_id: int, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    row = session.get(ProjectGuide, guide_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    data = _enrich_project_guide(session, row)
    session.commit()
    return data


@router.post("/projects/{project_id}/guides")
def create_project_guide(project_id: int, body: ProjectAssetIn, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    mode = _normalize_content_mode(body.content_mode)
    refs = _resolve_project_ref_skills(
        session, project_id, kind=body.kind, asset_id=body.asset_id, refs=body.ref_skills
    )
    row = ProjectGuide(
        project_id=project_id,
        asset_id=body.asset_id,
        name=_normalize_asset_name(body.name, body.asset_id),
        kind=body.kind,
        stage=body.stage,
        task=body.task,
        content=body.content,
        status=body.status or "draft",
        source="project",
        version=body.version or "1.0.0",
        content_mode=mode,
        package_path="",
        package_files_json="[]",
        ref_skills_json=ref_skills_to_json(refs),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        "guide_create",
        f"新建项目 Guide {row.asset_id}",
        {"asset_id": row.asset_id, "kind": row.kind, "content_mode": mode, "ref_skills": refs},
    )
    return _enrich_project_guide(session, row)


@router.put("/projects/{project_id}/guides/{guide_id}")
def update_project_guide(
    project_id: int, guide_id: int, body: ProjectGuideUpdateIn, session: SessionDep, user: CurrentUser
):
    _require_project_member(session, user, project_id)
    row = _require_editable_project_guide(session, project_id, guide_id)
    if body.asset_id is not None:
        row.asset_id = body.asset_id
    if body.name is not None or body.asset_id is not None:
        row.name = _normalize_asset_name(
            body.name if body.name is not None else row.name,
            body.asset_id if body.asset_id is not None else row.asset_id,
        )
    if body.kind is not None:
        row.kind = body.kind
    if body.content is not None:
        row.content = body.content
    if body.status is not None:
        row.status = body.status
    if body.content_mode is not None:
        mode = _normalize_content_mode(body.content_mode, fallback=row.content_mode or "markdown")
        row.content_mode = mode
        if mode != "package":
            row.package_path = ""
            row.package_files_json = "[]"
    if body.version is not None:
        row.version = body.version
    if body.ref_skills is not None or body.kind is not None:
        refs = _resolve_project_ref_skills(
            session,
            project_id,
            kind=row.kind,
            asset_id=row.asset_id,
            refs=body.ref_skills
            if body.ref_skills is not None
            else parse_ref_skills_json(getattr(row, "ref_skills_json", None)),
        )
        row.ref_skills_json = ref_skills_to_json(refs)
    row.source = "project"
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        "guide_update",
        f"更新项目 Guide {row.asset_id}",
        {
            "asset_id": row.asset_id,
            "kind": row.kind,
            "status": row.status,
            "content_mode": row.content_mode,
            "ref_skills": parse_ref_skills_json(getattr(row, "ref_skills_json", None)),
        },
    )
    return _enrich_project_guide(session, row)


@router.delete("/projects/{project_id}/guides/{guide_id}")
def delete_project_guide(project_id: int, guide_id: int, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    row = session.get(ProjectGuide, guide_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    data = _enrich_project_guide(session, row)
    if not data.get("editable"):
        raise HTTPException(400, "来自组织 HX 的 Guide 不可删除（重新初始化会同步组织资产）")
    aid = row.asset_id
    session.delete(row)
    session.commit()
    write_project_log(
        session,
        project_id,
        user,
        "guide_delete",
        f"删除项目 Guide {aid}",
        {"asset_id": aid},
    )
    return {"ok": True}


@router.post("/projects/{project_id}/guides/upload")
async def upload_project_guide(
    project_id: int,
    session: SessionDep,
    user: CurrentUser,
    asset_id: str = Form(...),
    name: str = Form(""),
    kind: str = Form("guide.skill"),
    stage: str = Form(""),
    task: str = Form(""),
    version: str = Form("1.0.0"),
    status: str = Form("draft"),
    guide_id: Optional[int] = Form(None),
    ref_skills: str = Form("[]"),
    files: list[UploadFile] = File(default_factory=list),
    relative_paths: list[str] = Form(default_factory=list),
):
    """Create/update a project Guide from uploaded file(s) or folder (multipart)."""
    _require_project_member(session, user, project_id)
    if not asset_id.strip():
        raise HTTPException(400, "asset_id required")
    if not files:
        raise HTTPException(400, "at least one file required")

    file_map: dict[str, bytes] = {}
    for i, uf in enumerate(files):
        data = await uf.read()
        rel = (
            relative_paths[i]
            if i < len(relative_paths) and relative_paths[i]
            else (uf.filename or f"file-{i}")
        )
        file_map[rel] = data

    aid = asset_id.strip()
    ver = (version or "1.0.0").strip() or "1.0.0"
    if guide_id:
        row = _require_editable_project_guide(session, project_id, guide_id)
        action = "guide_upload_update"
        summary = f"上传更新项目 Guide {aid}"
    else:
        existing = session.exec(
            select(ProjectGuide).where(
                ProjectGuide.project_id == project_id,
                ProjectGuide.asset_id == aid,
            )
        ).first()
        if existing:
            data = _enrich_project_guide(session, existing)
            if not data.get("editable"):
                raise HTTPException(400, f"asset_id 已存在且来自组织 HX，不可覆盖: {aid}")
            row = existing
            action = "guide_upload_update"
            summary = f"上传更新项目 Guide {aid}"
        else:
            row = ProjectGuide(project_id=project_id, source="project")
            action = "guide_upload_create"
            summary = f"上传新建项目 Guide {aid}"

    pkg_rel, saved = write_guide_package(_project_package_scope(project_id), aid, ver, file_map)
    content = pick_primary_content(file_map, kind)
    refs = _resolve_project_ref_skills(
        session,
        project_id,
        kind=kind,
        asset_id=aid,
        refs=parse_ref_skills_raw(ref_skills),
    )

    row.asset_id = aid
    row.name = _normalize_asset_name(name or getattr(row, "name", None) or "", aid)
    row.kind = kind
    row.stage = stage or ""
    row.task = task or ""
    row.version = ver
    row.status = status or "draft"
    row.source = "project"
    row.content = content
    row.content_mode = "package"
    row.package_path = pkg_rel
    row.package_files_json = json.dumps(saved, ensure_ascii=False)
    row.ref_skills_json = ref_skills_to_json(refs)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        action,
        summary,
        {
            "id": row.id,
            "asset_id": row.asset_id,
            "kind": kind,
            "files": saved,
            "package_path": pkg_rel,
            "ref_skills": refs,
        },
    )
    return _enrich_project_guide(session, row)


@router.get("/projects/{project_id}/guides/github-skills")
def list_project_github_skills(
    project_id: int,
    session: SessionDep,
    user: CurrentUser,
    repo: str,
    ref: str = "",
):
    """List skill directories (containing SKILL.md) in a GitHub repository."""
    _require_project_member(session, user, project_id)
    owner, name = _parse_repo_or_400(repo)
    token = _project_github_token(session, project_id)
    try:
        skills = github_svc.list_repo_skills(owner, name, token=token or None, ref=ref or None)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc
    return {
        "repo": f"{owner}/{name}",
        "ref": (ref or "").strip() or None,
        "skills": [{"id": s.id, "path": s.path, "skill_md_path": s.skill_md_path} for s in skills],
    }


def _install_project_guide_from_github(
    session: SessionDep,
    project_id: int,
    *,
    repo: str,
    skill_path: str,
    asset_id: Optional[str] = None,
    version: str = "1.0.0",
    status: str = "draft",
    guide_id: Optional[int] = None,
    ref: Optional[str] = None,
    skip_if_exists: bool = False,
) -> ProjectGuide | dict[str, Any]:
    owner, name = _parse_repo_or_400(repo)
    skill_path = (skill_path or "").replace("\\", "/").strip("/")
    if not skill_path:
        raise HTTPException(400, "skill_path required")
    token = _project_github_token(session, project_id)
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
        row = _require_editable_project_guide(session, project_id, guide_id)
    else:
        existing = session.exec(
            select(ProjectGuide).where(
                ProjectGuide.project_id == project_id,
                ProjectGuide.asset_id == aid,
            )
        ).first()
        if existing:
            data = _enrich_project_guide(session, existing)
            if not data.get("editable"):
                if skip_if_exists:
                    return {"skipped": True, "asset_id": aid, "reason": "asset_id 来自组织，不可覆盖"}
                raise HTTPException(400, f"asset_id 已存在且来自组织 HX: {aid}")
            if skip_if_exists:
                return {"skipped": True, "asset_id": aid, "reason": "asset_id 已存在"}
            raise HTTPException(400, f"asset_id 已存在: {aid}，请更换或传入 guide_id 覆盖")
        row = ProjectGuide(project_id=project_id, source="project")

    pkg_rel, saved = write_guide_package(_project_package_scope(project_id), aid, ver, file_map)
    content = pick_primary_content(file_map, kind)

    row.asset_id = aid
    row.name = _normalize_asset_name(getattr(row, "name", None) or "", aid)
    row.kind = kind
    row.stage = ""
    row.task = ""
    row.version = ver
    row.status = status or "draft"
    row.source = "project"
    row.content = content
    row.content_mode = "package"
    row.package_path = pkg_rel
    row.package_files_json = json.dumps(saved, ensure_ascii=False)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.post("/projects/{project_id}/guides/from-github")
def create_project_guide_from_github(
    project_id: int, body: ProjectGuideFromGithubIn, session: SessionDep, user: CurrentUser
):
    """Download a skill directory from GitHub and install as project guide.skill package."""
    _require_project_member(session, user, project_id)
    try:
        result = _install_project_guide_from_github(
            session,
            project_id,
            repo=body.repo,
            skill_path=body.skill_path,
            asset_id=body.asset_id,
            version=body.version,
            status=body.status,
            guide_id=body.guide_id,
            ref=body.ref,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc
    if isinstance(result, dict):
        return result
    write_project_log(
        session,
        project_id,
        user,
        "guide_from_github",
        f"从 GitHub 安装项目 Guide {result.asset_id}",
        {"repo": body.repo, "skill_path": body.skill_path, "asset_id": result.asset_id, "ref": body.ref},
    )
    return _enrich_project_guide(session, result)


@router.post("/projects/{project_id}/guides/from-github-batch")
def create_project_guides_from_github_batch(
    project_id: int, body: ProjectGuideFromGithubBatchIn, session: SessionDep, user: CurrentUser
):
    """Install multiple GitHub skills as project guide.skill packages."""
    _require_project_member(session, user, project_id)
    if not body.skills:
        raise HTTPException(400, "skills required")
    created: list[Any] = []
    skipped: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for item in body.skills:
        sp = (item.skill_path or "").strip()
        try:
            result = _install_project_guide_from_github(
                session,
                project_id,
                repo=body.repo,
                skill_path=sp,
                asset_id=item.asset_id,
                version=body.version,
                status=body.status,
                ref=body.ref,
                skip_if_exists=True,
            )
            if isinstance(result, dict) and result.get("skipped"):
                skipped.append(result)
            else:
                created.append(_enrich_project_guide(session, result))  # type: ignore[arg-type]
        except HTTPException as exc:
            errors.append({"skill_path": sp, "detail": exc.detail})
        except Exception as exc:  # noqa: BLE001
            errors.append({"skill_path": sp, "detail": str(exc)})
    created_ids = [c.get("asset_id") for c in created if isinstance(c, dict)]
    write_project_log(
        session,
        project_id,
        user,
        "guide_from_github_batch",
        f"批量从 GitHub 安装项目 Guide：+{len(created_ids)}/skip{len(skipped)}/err{len(errors)}",
        {
            "repo": body.repo,
            "ref": body.ref,
            "created": created_ids,
            "skipped": skipped,
            "errors": errors,
        },
    )
    return {"created": created, "skipped": skipped, "errors": errors}


@router.get("/projects/{project_id}/guides/{guide_id}/package")
def get_project_guide_package(
    project_id: int, guide_id: int, session: SessionDep, user: CurrentUser
):
    _require_project_member(session, user, project_id)
    row = session.get(ProjectGuide, guide_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    enriched = _enrich_project_guide(session, row)
    package_path = (enriched.get("package_path") or "").strip()
    package_files_json = enriched.get("package_files_json") or "[]"
    content = enriched.get("content") or ""

    meta_files: list[str] = []
    try:
        meta_files = [
            str(f).replace("\\", "/").lstrip("./")
            for f in json.loads(package_files_json or "[]")
            if str(f).strip()
        ]
    except json.JSONDecodeError:
        meta_files = []

    disk_files: list[str] = []
    if package_path:
        try:
            root = resolve_package_root(package_path)
            disk_files = sorted(
                str(p.relative_to(root)).replace("\\", "/")
                for p in root.rglob("*")
                if p.is_file()
            )
        except ValueError:
            disk_files = []

    files = merge_package_file_list(
        sorted({*meta_files, *disk_files}),
        content=content,
        kind=enriched.get("kind") or row.kind or "",
    )
    return {
        "id": row.id,
        "asset_id": row.asset_id,
        "package_path": package_path,
        "content_mode": enriched.get("content_mode") or row.content_mode,
        "kind": enriched.get("kind") or row.kind,
        "files": files,
        "content": content,
        "org_guide_id": enriched.get("org_guide_id"),
    }


@router.get("/projects/{project_id}/guides/{guide_id}/package-file")
def get_project_guide_package_file(
    project_id: int,
    guide_id: int,
    path: str,
    session: SessionDep,
    user: CurrentUser,
):
    _require_project_member(session, user, project_id)
    row = session.get(ProjectGuide, guide_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    enriched = _enrich_project_guide(session, row)
    package_path = (enriched.get("package_path") or "").strip()
    content = enriched.get("content") or ""
    kind = enriched.get("kind") or row.kind or ""

    rel = (path or "").replace("\\", "/").lstrip("./")
    if not rel or ".." in rel.split("/"):
        raise HTTPException(400, "invalid path")
    if kind == "guide.template" and Path(rel).name.lower() == "skill.md":
        raise HTTPException(404, "template 包不含 SKILL.md")

    root = None
    if package_path:
        try:
            root = resolve_package_root(package_path)
        except ValueError:
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

    if content_fallback_for_path(rel, kind) and (content or "").strip():
        data = content.encode("utf-8")
        return Response(
            content=data,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": content_disposition_inline(Path(rel).name)},
        )
    raise HTTPException(404, "file not found")


@router.put("/projects/{project_id}/guides/{guide_id}/package-file")
async def put_project_guide_package_file(
    project_id: int,
    guide_id: int,
    path: str,
    session: SessionDep,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    """Overwrite a single file inside a project guide package."""
    _require_project_member(session, user, project_id)
    row = _require_editable_project_guide(session, project_id, guide_id)
    pkg = (row.package_path or "").strip()
    if not pkg or (row.content_mode or "") != "package":
        raise HTTPException(400, "仅项目私有 package 模式且已有包路径时可写回文件")
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
    if Path(rel).suffix.lower() in (".md", ".markdown", ".txt"):
        try:
            row.content = data.decode("utf-8")
        except UnicodeDecodeError:
            pass
    row.package_files_json = package_files_json_dumps(saved)
    row.source = "project"
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        "guide_package_file_put",
        f"写回项目 Guide 包文件 {row.asset_id}:{rel}",
        {"id": row.id, "path": rel, "bytes": len(data)},
    )
    return {
        "ok": True,
        "path": rel,
        "files": merge_package_file_list(saved, content=row.content or "", kind=row.kind or ""),
        "package_path": row.package_path,
    }

@router.get("/projects/{project_id}/sensors")
def list_project_sensors(project_id: int, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    rows = session.exec(select(ProjectSensor).where(ProjectSensor.project_id == project_id)).all()
    _, sensor_bindings = _project_asset_bindings(session, project_id)
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
        binds = _merge_row_stage_task(
            sensor_bindings.get(r.asset_id, []),
            r.stage or "",
            r.task or "",
        )
        d["bindings"] = binds
        d["linked_stages"] = sorted({b["stage"] for b in binds if b.get("stage")})
        d["linked_tasks"] = sorted(
            {
                f"{b['stage']}/{b['task']}" if b.get("stage") and b.get("task") else (b.get("task") or b.get("stage") or "")
                for b in binds
                if b.get("stage") or b.get("task")
            }
        )
        out.append(d)
    return out


@router.post("/projects/{project_id}/sensors")
def create_project_sensor(project_id: int, body: ProjectAssetIn, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    from app.domain.sensor_specs import lean_sensor_content, normalize_scope, normalize_triggers

    check_type = "human" if body.check_type in ("human", "manual") else body.check_type
    kind = "sensor.human" if check_type == "human" else body.kind
    row = ProjectSensor(
        project_id=project_id,
        asset_id=body.asset_id,
        name=_normalize_asset_name(body.name, body.asset_id),
        kind=kind,
        stage=body.stage,
        task=body.task,
        check_type=check_type,
        content=lean_sensor_content(body.content),
        triggers_json=json.dumps(normalize_triggers(body.triggers), ensure_ascii=False),
        scope_json=json.dumps(normalize_scope(body.scope), ensure_ascii=False),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        "sensor_create",
        f"新建项目 Check {row.asset_id}",
        {"asset_id": row.asset_id, "check_type": row.check_type},
    )
    return row


@router.put("/projects/{project_id}/sensors/{sensor_id}")
def update_project_sensor(
    project_id: int, sensor_id: int, body: ProjectAssetIn, session: SessionDep, user: CurrentUser
):
    _require_project_member(session, user, project_id)
    from app.domain.sensor_specs import lean_sensor_content, normalize_scope, normalize_triggers

    row = session.get(ProjectSensor, sensor_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    check_type = "human" if body.check_type in ("human", "manual") else body.check_type
    kind = "sensor.human" if check_type == "human" else body.kind
    row.asset_id = body.asset_id
    row.name = _normalize_asset_name(body.name, body.asset_id)
    row.kind = kind
    row.stage = body.stage
    row.task = body.task
    row.check_type = check_type
    row.content = lean_sensor_content(body.content)
    row.triggers_json = json.dumps(normalize_triggers(body.triggers), ensure_ascii=False)
    row.scope_json = json.dumps(normalize_scope(body.scope), ensure_ascii=False)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        "sensor_update",
        f"更新项目 Check {row.asset_id}",
        {"asset_id": row.asset_id, "check_type": row.check_type},
    )
    return row


@router.delete("/projects/{project_id}/sensors/{sensor_id}")
def delete_project_sensor(project_id: int, sensor_id: int, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    row = session.get(ProjectSensor, sensor_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    aid = row.asset_id
    session.delete(row)
    session.commit()
    write_project_log(
        session,
        project_id,
        user,
        "sensor_delete",
        f"删除项目 Check {aid}",
        {"asset_id": aid},
    )
    return {"ok": True}


@router.get("/projects/{project_ref}/export")
def export_project(
    project_ref: str,
    session: SessionDep,
    user: CurrentUser,
    stages: Optional[str] = None,
):
    """Read-only HX export for nhx CLI. stages=req,dev filters stages (comma-separated)."""
    project: Project | None = None
    if project_ref.isdigit():
        project = session.get(Project, int(project_ref))
    if not project:
        project = session.exec(select(Project).where(Project.slug == project_ref)).first()
    if not project:
        raise HTTPException(404, "project not found")
    _require_project_member(session, user, project.id)
    stage_list = [s.strip() for s in (stages or "").split(",") if s.strip()] or None
    return export_project_for_cli(session, project, stage_list)


@router.get("/projects/{project_id}/tasks")
def list_project_tasks(project_id: int, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    rows = list(session.exec(select(ProjectTask).where(ProjectTask.project_id == project_id)).all())
    rows.sort(
        key=lambda r: (
            r.stage or "",
            0 if not r.custom else 1,
            getattr(r, "sort_order", 0) or 0,
            r.id or 0,
        )
    )
    return [
        {
            **r.model_dump(),
            "guides": json.loads(r.guides_json or "[]"),
            "sensors": json.loads(r.sensors_json or "[]"),
            "slash_name": f"hx-{r.stage}-{r.task_id.replace('_', '-')}",
        }
        for r in rows
    ]


@router.get("/projects/{project_id}/shells")
def list_project_shells(project_id: int, session: SessionDep, user: CurrentUser):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    tasks = session.exec(select(ProjectTask).where(ProjectTask.project_id == project_id)).all()
    project_guides = session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project_id)).all()
    project_guide_map = {g.asset_id: g for g in project_guides}
    org_by_aid = {
        g.asset_id: g for g in session.exec(select(Guide).where(Guide.org_id == "default")).all()
    }
    org_shells = session.exec(select(CommandShell).where(CommandShell.org_id == "default")).all()
    shell_map = {(s.stage or "", s.task or ""): s for s in org_shells}
    rows: list[dict[str, Any]] = []
    for t in tasks:
        stage = t.stage or ""
        task_id = t.task_id or ""
        title = t.title or task_id or ""
        ide_slash = f"nhx-{stage}-{task_id.replace('_', '-')}"
        shell = shell_map.get((stage, task_id))
        command_body = (shell.body if shell else "") or ""
        skill_body = (shell.appendix if shell else "") or ""
        description = (shell.description if shell else "") or title
        slash_name = (shell.slash_name if shell else "") or f"hx-{stage}-{task_id.replace('_', '-')}"
        if not command_body.strip():
            try:
                guides = json.loads(t.guides_json or "[]")
            except Exception:
                guides = []
            try:
                sensors = json.loads(t.sensors_json or "[]")
            except Exception:
                sensors = []
            guide_ids = [g for g in guides if isinstance(g, str) and g and not g.startswith("wf-")]
            sensor_ids = [s for s in sensors if isinstance(s, str) and s]
            from app.domain.guide_samples import split_guides_by_kind

            kind_map = {
                gid: ((project_guide_map[gid].kind if gid in project_guide_map else "") or "")
                for gid in guide_ids
            }
            skills, templates, other_guides = split_guides_by_kind(guide_ids, kind_map)
            from app.domain.guide_package import pick_primary_package_filename

            guide_contents = {
                gid: (project_guide_map[gid].content or "")
                for gid in [*skills, *templates, *(g for g, _ in other_guides)]
                if gid in project_guide_map
            }
            template_primary_files: dict[str, str] = {}
            for tid in templates:
                pg = project_guide_map.get(tid)
                if not pg:
                    continue
                enriched = _enrich_project_guide(session, pg, org_by_aid=org_by_aid)
                try:
                    files = json.loads(enriched.get("package_files_json") or "[]")
                except Exception:
                    files = []
                if not isinstance(files, list):
                    files = []
                primary = pick_primary_package_filename(
                    [str(x) for x in files], enriched.get("kind") or pg.kind or ""
                )
                if primary:
                    template_primary_files[tid] = primary
            body = defaults.default_workflow_body(stage, task_id, title)
            assembled = assemble_shell(
                stage=stage,
                task=task_id,
                description=description or title,
                body=body,
                guides=skills,
                templates=templates,
                sensors=sensor_ids,
                guide_contents=guide_contents,
                other_guides=other_guides,
                template_primary_files=template_primary_files,
            )
            command_body = assembled["body"]
            skill_body = assembled["appendix"]
            description = assembled["description"] or description
        rows.append(
            {
                "task_row_id": t.id,
                "stage": stage,
                "task_id": task_id,
                "title": title,
                "slash_name": slash_name,
                "ide_slash_name": ide_slash,
                "command_body": command_body,
                "skill_body": skill_body,
                "description": description,
                "source": "org" if shell else "generated",
            }
        )
    rows_sorted = sorted(rows, key=lambda x: (x.get("stage", ""), x.get("task_id", "")))
    return rows_sorted


@router.get("/projects/{project_id}/custom-task-options")
def custom_task_options(project_id: int, session: SessionDep, user: CurrentUser, org_id: str = "default"):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    guides = session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project_id)).all()
    sensors = session.exec(select(ProjectSensor).where(ProjectSensor.project_id == project_id)).all()
    return {
        "stages": list_project_stage_options(session, project),
        "guides": [
            {
                "asset_id": g.asset_id,
                "name": (getattr(g, "name", None) or g.asset_id or "")[:20],
                "kind": g.kind,
                "stage": g.stage,
                "task": g.task,
            }
            for g in guides
            if g.kind not in ("guide.workflow", "guide.command") and not (g.asset_id or "").startswith("wf-")
        ],
        "sensors": [
            {
                "asset_id": s.asset_id,
                "name": (getattr(s, "name", None) or s.asset_id or "")[:20],
                "kind": s.kind,
                "check_type": s.check_type,
            }
            for s in sensors
        ],
    }


@router.post("/projects/{project_id}/tasks")
def create_project_task(project_id: int, body: CustomTaskIn, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)

    task_id = (body.task_id or "").strip()
    stage = (body.stage or "").strip()
    if not task_id or not stage:
        raise HTTPException(400, "stage and task_id are required")
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9_\-]*$", task_id):
        raise HTTPException(400, "task_id must be alphanumeric / underscore / hyphen")

    dup = session.exec(
        select(ProjectTask).where(
            ProjectTask.project_id == project_id,
            ProjectTask.stage == stage,
            ProjectTask.task_id == task_id,
        )
    ).first()
    if dup:
        raise HTTPException(400, f"task `{stage}/{task_id}` already exists")

    sensors = list(body.sensors or [])
    guides = list(body.guides or [])
    shell = ensure_task_shells(
        session,
        project_id=project_id,
        stage=stage,
        task_id=task_id,
        title=body.title or task_id,
        guides=guides,
        sensors=sensors,
    )
    guides = shell["guides"]

    row = ProjectTask(
        project_id=project_id,
        stage=stage,
        task_id=task_id,
        title=body.title or task_id,
        required=body.required,
        suite="",
        guides_json=json.dumps(guides, ensure_ascii=False),
        sensors_json=json.dumps(sensors, ensure_ascii=False),
        custom=True,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        "task_create",
        f"新建自定义 Task {stage}/{task_id}",
        {"stage": stage, "task_id": task_id, "guides": guides, "sensors": sensors},
    )
    return {
        **row.model_dump(),
        "guides": guides,
        "sensors": sensors,
        "shell": shell,
        "slash_name": shell["slash_name"],
        "skill_id": shell.get("skill_id"),
    }


@router.put("/projects/{project_id}/tasks/{task_row_id}")
def update_project_task(
    project_id: int, task_row_id: int, body: ProjectTaskUpdateIn, session: SessionDep, user: CurrentUser
):
    _require_project_member(session, user, project_id)
    """Update guides/sensors (and optional title/required) for a project task — custom or profile."""
    row = session.get(ProjectTask, task_row_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    if body.title is not None:
        row.title = body.title
    if body.required is not None:
        row.required = body.required
    if body.guides is not None:
        row.guides_json = json.dumps(body.guides, ensure_ascii=False)
    if body.sensors is not None:
        row.sensors_json = json.dumps(body.sensors, ensure_ascii=False)
        row.suite = ""  # flatten: direct sensor binding
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        project_id,
        user,
        "task_update",
        f"更新 Task {row.stage}/{row.task_id}",
        {
            "stage": row.stage,
            "task_id": row.task_id,
            "custom": row.custom,
            "guides": json.loads(row.guides_json or "[]"),
            "sensors": json.loads(row.sensors_json or "[]"),
        },
    )
    return {
        **row.model_dump(),
        "guides": json.loads(row.guides_json or "[]"),
        "sensors": json.loads(row.sensors_json or "[]"),
        "slash_name": f"hx-{row.stage}-{row.task_id.replace('_', '-')}",
    }


@router.delete("/projects/{project_id}/tasks/{task_row_id}")
def delete_project_task(project_id: int, task_row_id: int, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    row = session.get(ProjectTask, task_row_id)
    if not row or row.project_id != project_id:
        raise HTTPException(404)
    if not row.custom:
        raise HTTPException(400, "cannot delete profile-materialized task; re-init config instead")
    label = f"{row.stage}/{row.task_id}"
    delete_task_shells(session, project_id, row.task_id)
    session.delete(row)
    session.commit()
    write_project_log(
        session,
        project_id,
        user,
        "task_delete",
        f"删除自定义 Task {label}",
        {"stage": row.stage, "task_id": row.task_id},
    )
    return {"ok": True}


# ---- Artifacts ----


def _normalize_artifact_rel(rel: str) -> str:
    text = (rel or "").replace("\\", "/").strip().lstrip("/")
    parts = [p for p in text.split("/") if p and p != "."]
    if any(p == ".." for p in parts):
        raise HTTPException(400, f"invalid relative path: {rel}")
    return "/".join(parts)


def _project_used_artifact_basenames(
    session: SessionDep,
    project_id: int,
    *,
    exclude_artifact_id: int | None = None,
) -> set[str]:
    """Basenames from latest versions of project artifacts (optionally skip one)."""
    used: set[str] = set()
    arts = session.exec(select(Artifact).where(Artifact.project_id == project_id)).all()
    for art in arts:
        if exclude_artifact_id is not None and art.id == exclude_artifact_id:
            continue
        ver = session.exec(
            select(ArtifactVersion).where(
                ArtifactVersion.artifact_id == art.id,
                ArtifactVersion.version == art.latest_version,
            )
        ).first()
        if not ver and art.latest_version:
            rows = session.exec(
                select(ArtifactVersion).where(ArtifactVersion.artifact_id == art.id)
            ).all()
            ver = max(rows, key=lambda v: v.version or 0) if rows else None
        if not ver:
            continue
        for rel in _version_files(ver):
            base = rel.rsplit("/", 1)[-1].lower()
            if base:
                used.add(base)
    return used


def _dedupe_upload_file_map(
    session: SessionDep,
    project_id: int,
    file_map: dict[str, bytes],
    *,
    exclude_artifact_id: int | None = None,
) -> tuple[dict[str, bytes], list[dict[str, str]]]:
    from app.domain.artifact_files import dedupe_file_map

    used = _project_used_artifact_basenames(
        session, project_id, exclude_artifact_id=exclude_artifact_id
    )
    return dedupe_file_map(file_map, used)


def _version_root(ver: ArtifactVersion) -> Path:
    return Path(ver.storage_path)


def _version_files(ver: ArtifactVersion) -> list[str]:
    try:
        parsed = json.loads(ver.files_json or "[]")
        if isinstance(parsed, list) and parsed:
            return [str(x) for x in parsed]
    except Exception:  # noqa: BLE001
        pass
    root = _version_root(ver)
    if root.is_file():
        return [root.name]
    if root.is_dir():
        files: list[str] = []
        for p in sorted(root.rglob("*")):
            if p.is_file():
                files.append(p.relative_to(root).as_posix())
        return files
    return []


def _version_public(ver: ArtifactVersion) -> dict[str, Any]:
    root = _version_root(ver)
    kind = (ver.content_kind or "file").strip() or "file"
    if root.is_file():
        kind = "file"
    elif root.is_dir() and kind == "file" and len(_version_files(ver)) > 1:
        kind = "package"
    return {
        "id": ver.id,
        "artifact_id": ver.artifact_id,
        "version": ver.version,
        "note": ver.note,
        "created_by": ver.created_by,
        "created_at": ver.created_at,
        "content_kind": kind,
        "files": _version_files(ver),
        "storage_path": ver.storage_path,
    }


def _resolve_version_file(ver: ArtifactVersion, rel_path: str = "") -> Path:
    root = _version_root(ver)
    files = _version_files(ver)
    if root.is_file():
        if rel_path and _normalize_artifact_rel(rel_path) not in ("", root.name):
            raise HTTPException(404, "file not found in version")
        return root
    if not root.is_dir():
        raise HTTPException(404, "version storage missing")
    if not rel_path:
        if len(files) == 1:
            rel_path = files[0]
        else:
            raise HTTPException(400, "path required for package version")
    rel = _normalize_artifact_rel(rel_path)
    if rel not in files and files:
        # still allow if file exists on disk under root
        pass
    target = (root / rel).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError as exc:
        raise HTTPException(400, "path escapes version root") from exc
    if not target.is_file():
        raise HTTPException(404, "file not found in version")
    return target


async def _collect_upload_map(
    file: UploadFile | None,
    files: list[UploadFile],
    relative_paths: list[str],
) -> tuple[str, dict[str, bytes]]:
    file_map: dict[str, bytes] = {}
    if files:
        for i, uf in enumerate(files):
            data = await uf.read()
            raw_rel = relative_paths[i] if i < len(relative_paths) and relative_paths[i] else (uf.filename or f"file-{i}")
            rel = _normalize_artifact_rel(raw_rel)
            if not rel:
                raise HTTPException(400, "empty relative path")
            file_map[rel] = data
    elif file is not None:
        data = await file.read()
        rel = _normalize_artifact_rel(file.filename or "artifact.bin")
        file_map[rel] = data
    else:
        raise HTTPException(400, "at least one file required")
    if not file_map:
        raise HTTPException(400, "at least one file required")
    kind = "package" if len(file_map) > 1 or any("/" in k for k in file_map) else "file"
    return kind, file_map


def _write_artifact_version_files(ver_dir: Path, file_map: dict[str, bytes]) -> list[str]:
    ver_dir.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    for rel, data in sorted(file_map.items()):
        dest = ver_dir / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        saved.append(rel)
    return saved


@router.get("/artifacts")
def list_artifacts(
    session: SessionDep,
    user: CurrentUser,
    project_id: Optional[int] = None,
    stage: Optional[str] = None,
    task: Optional[str] = None,
):
    if project_id is not None:
        _require_project_member(session, user, project_id)
    q = select(Artifact)
    if project_id is not None:
        q = q.where(Artifact.project_id == project_id)
    if stage:
        q = q.where(Artifact.stage == stage)
    if task:
        q = q.where(Artifact.task == task)
    rows = session.exec(q).all()
    if not _is_org_admin(user) and project_id is None:
        memberships = session.exec(select(ProjectMember).where(ProjectMember.user_id == user.id)).all()
        pids = {m.project_id for m in memberships}
        rows = [a for a in rows if a.project_id in pids]
    created_map: dict[int, datetime | None] = {}
    for a in rows:
        vers = session.exec(select(ArtifactVersion).where(ArtifactVersion.artifact_id == a.id)).all()
        created_candidates = [_as_utc(v.created_at) for v in vers if _as_utc(v.created_at)]
        created_map[a.id or 0] = min(created_candidates) if created_candidates else _as_utc(a.updated_at)

    rows_sorted = sorted(
        rows,
        key=lambda a: (created_map.get(a.id or 0) or datetime.min.replace(tzinfo=timezone.utc), a.id or 0),
        reverse=True,
    )
    out = []
    for a in rows_sorted:
        p = session.get(Project, a.project_id)
        created_at = created_map.get(a.id or 0)
        out.append(
            {
                **a.model_dump(),
                "created_at": created_at.isoformat().replace("+00:00", "Z") if created_at else a.updated_at,
                "updated_at": _as_utc(a.updated_at).isoformat().replace("+00:00", "Z") if _as_utc(a.updated_at) else a.updated_at,
                "project_name": p.name if p else "",
                "can_delete": _can_manage_project(session, user, a.project_id),
            }
        )
    return out


@router.post("/artifacts")
async def create_artifact(
    session: SessionDep,
    user: CurrentUser,
    project_id: int = Form(...),
    name: str = Form(...),
    stage: str = Form(""),
    task: str = Form(""),
    note: str = Form(""),
    file: Optional[UploadFile] = File(None),
    files: list[UploadFile] = File(default_factory=list),
    relative_paths: list[str] = Form(default_factory=list),
):
    if not session.get(Project, project_id):
        raise HTTPException(404, "project not found")
    _require_project_member(session, user, project_id)
    kind, file_map = await _collect_upload_map(file, files, relative_paths)

    art = session.exec(
        select(Artifact).where(Artifact.project_id == project_id, Artifact.name == name)
    ).first()
    if not art:
        art = Artifact(project_id=project_id, name=name, stage=stage, task=task)
        session.add(art)
        session.commit()
        session.refresh(art)

    file_map, renames = _dedupe_upload_file_map(
        session, project_id, file_map, exclude_artifact_id=art.id
    )
    if len(file_map) > 1 or any("/" in k for k in file_map):
        kind = "package"
    else:
        kind = "file"

    art.latest_version += 1
    art.stage = stage or art.stage
    art.task = task or art.task
    art.updated_at = datetime.now(timezone.utc)
    settings = get_settings()
    ver_dir = settings.artifacts_dir / str(project_id) / str(art.id) / f"v{art.latest_version}"
    if ver_dir.exists():
        shutil.rmtree(ver_dir)
    saved = _write_artifact_version_files(ver_dir, file_map)
    ver = ArtifactVersion(
        artifact_id=art.id,
        version=art.latest_version,
        storage_path=str(ver_dir),
        note=note,
        created_by=user.username,
        content_kind=kind,
        files_json=json.dumps(saved, ensure_ascii=False),
    )
    session.add(art)
    session.add(ver)
    session.commit()
    session.refresh(art)
    session.refresh(ver)
    write_project_log(
        session,
        project_id,
        user,
        "artifact_submit",
        f"提交产物 {name} v{ver.version}"
        + (f"（{stage}/{task}）" if stage or task else ""),
        {
            "artifact_id": art.id,
            "name": name,
            "version": ver.version,
            "stage": stage or art.stage,
            "task": task or art.task,
            "content_kind": kind,
            "files": saved,
            "renamed_files": renames,
            "note": note,
        },
    )
    return {
        "artifact": art.model_dump(),
        "version": _version_public(ver),
        "renamed_files": renames,
    }


@router.delete("/artifacts/{artifact_id}")
def delete_artifact(artifact_id: int, session: SessionDep, user: CurrentUser):
    art = session.get(Artifact, artifact_id)
    if not art:
        raise HTTPException(404)
    if not _can_manage_project(session, user, art.project_id):
        raise HTTPException(403, "仅组织管理者或项目所有者可删除产物")
    settings = get_settings()
    art_dir = settings.artifacts_dir / str(art.project_id) / str(art.id)
    for ver in session.exec(select(ArtifactVersion).where(ArtifactVersion.artifact_id == artifact_id)).all():
        session.delete(ver)
    session.delete(art)
    session.commit()
    if art_dir.exists():
        shutil.rmtree(art_dir, ignore_errors=True)
    return {"ok": True}


@router.get("/artifacts/{artifact_id}")
def get_artifact(artifact_id: int, session: SessionDep, user: CurrentUser):
    art = session.get(Artifact, artifact_id)
    if not art:
        raise HTTPException(404)
    _require_project_member(session, user, art.project_id)
    p = session.get(Project, art.project_id)
    versions = session.exec(select(ArtifactVersion).where(ArtifactVersion.artifact_id == artifact_id)).all()
    latest = None
    if versions:
        latest = sorted(versions, key=lambda v: v.version, reverse=True)[0]
    return {
        **art.model_dump(),
        "project_name": p.name if p else "",
        "latest": _version_public(latest) if latest else None,
    }


@router.get("/artifacts/{artifact_id}/versions")
def list_versions(artifact_id: int, session: SessionDep, user: CurrentUser):
    art = session.get(Artifact, artifact_id)
    if not art:
        raise HTTPException(404)
    _require_project_member(session, user, art.project_id)
    rows = session.exec(select(ArtifactVersion).where(ArtifactVersion.artifact_id == artifact_id)).all()
    return [_version_public(v) for v in sorted(rows, key=lambda r: r.version, reverse=True)]


@router.get("/artifacts/{artifact_id}/versions/{version}")
def get_artifact_version(artifact_id: int, version: int, session: SessionDep, user: CurrentUser):
    art = session.get(Artifact, artifact_id)
    if not art:
        raise HTTPException(404)
    _require_project_member(session, user, art.project_id)
    ver = session.exec(
        select(ArtifactVersion).where(
            ArtifactVersion.artifact_id == artifact_id,
            ArtifactVersion.version == version,
        )
    ).first()
    if not ver:
        raise HTTPException(404, "version not found")
    return _version_public(ver)


@router.get("/artifacts/{artifact_id}/versions/{version}/content")
def get_artifact_version_content(
    artifact_id: int,
    version: int,
    session: SessionDep,
    user: CurrentUser,
    path: str = "",
):
    art = session.get(Artifact, artifact_id)
    if not art:
        raise HTTPException(404)
    _require_project_member(session, user, art.project_id)
    ver = session.exec(
        select(ArtifactVersion).where(
            ArtifactVersion.artifact_id == artifact_id,
            ArtifactVersion.version == version,
        )
    ).first()
    if not ver:
        raise HTTPException(404, "version not found")
    target = _resolve_version_file(ver, path)
    media, _ = mimetypes.guess_type(str(target))
    return FileResponse(
        path=str(target),
        media_type=media or "application/octet-stream",
        filename=target.name,
    )


# ---- Tickets ----


def _next_ticket_no(session: SessionDep) -> str:
    count = len(session.exec(select(Ticket)).all()) + 1
    return f"TK-{datetime.now().year}-{count:04d}"


def _artifacts_for_scope(
    session: SessionDep,
    project_id: int,
    stage: str,
    task: str,
    artifact_name: str = "",
) -> list[Artifact]:
    q = select(Artifact).where(
        Artifact.project_id == project_id,
        Artifact.stage == stage,
        Artifact.task == task,
    )
    if artifact_name:
        q = q.where(Artifact.name == artifact_name)
    return list(session.exec(q).all())


def _require_human_check_artifacts(
    session: SessionDep,
    *,
    project_id: int,
    stage: str,
    task: str,
    artifact_name: str = "",
) -> list[Artifact]:
    stage = (stage or "").strip()
    task = (task or "").strip()
    artifact_name = (artifact_name or "").strip()
    if not stage or not task:
        raise HTTPException(400, "human-check 工单必须填写 Stage 与 Task")
    arts = _artifacts_for_scope(session, project_id, stage, task, artifact_name)
    if not arts:
        if artifact_name:
            raise HTTPException(
                400,
                f"未找到产物「{artifact_name}」（{stage}/{task}）。请先在 WebUI「产物」页或 nhx submit 上传后再创建/提交工单。",
            )
        raise HTTPException(
            400,
            f"任务 {stage}/{task} 尚无产物。请先上传该任务产物（WebUI「产物」或 nhx submit）后再创建/提交人工审批工单。",
        )
    return arts


def _ticket_artifact_payloads(arts: list[Artifact]) -> list[dict[str, Any]]:
    return [
        {
            "id": a.id,
            "name": a.name,
            "stage": a.stage,
            "task": a.task,
            "latest_version": a.latest_version,
            "path_hint": a.path_hint,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        }
        for a in arts
    ]


@router.get("/tickets")
def list_tickets(
    session: SessionDep,
    user: CurrentUser,
    status: Optional[str] = None,
    project_id: Optional[int] = None,
    stage: Optional[str] = None,
    task: Optional[str] = None,
):
    if project_id is not None:
        _require_project_member(session, user, project_id)
    q = select(Ticket)
    if status:
        q = q.where(Ticket.status == status)
    if project_id is not None:
        q = q.where(Ticket.project_id == project_id)
    if stage:
        q = q.where(Ticket.stage == stage)
    if task:
        q = q.where(Ticket.task == task)
    rows = session.exec(q).all()
    rows_sorted = sorted(
        rows,
        key=lambda t: (_as_utc(t.created_at) or datetime.min.replace(tzinfo=timezone.utc), t.id or 0),
        reverse=True,
    )
    out = []
    for t in rows_sorted:
        p = session.get(Project, t.project_id)
        dump = t.model_dump()
        dump["created_at"] = (
            _as_utc(t.created_at).isoformat().replace("+00:00", "Z")
            if _as_utc(t.created_at)
            else t.created_at
        )
        out.append({**dump, "project_name": p.name if p else ""})
    return out


@router.post("/tickets")
def create_ticket(body: TicketIn, session: SessionDep, user: CurrentUser):
    if not session.get(Project, body.project_id):
        raise HTTPException(404, "project not found")
    _require_project_member(session, user, body.project_id)
    if (body.ticket_type or "") == "human-check":
        _require_human_check_artifacts(
            session,
            project_id=body.project_id,
            stage=body.stage or "",
            task=body.task or "",
            artifact_name=body.artifact_name or "",
        )
    row = Ticket(
        ticket_no=_next_ticket_no(session),
        project_id=body.project_id,
        title=body.title,
        ticket_type=body.ticket_type,
        body=body.body,
        assignee_role=body.assignee_role,
        stage=body.stage or "",
        task=body.task or "",
        artifact_name=body.artifact_name or "",
        status="draft",
        submitter=user.username,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        body.project_id,
        user,
        "ticket_create",
        f"创建工单 {row.ticket_no}（{row.ticket_type or 'ticket'}）"
        + (f" {row.stage}/{row.task}" if row.stage or row.task else ""),
        {
            "ticket_id": row.id,
            "ticket_no": row.ticket_no,
            "ticket_type": row.ticket_type,
            "stage": row.stage,
            "task": row.task,
            "artifact_name": row.artifact_name,
            "title": row.title,
            "status": row.status,
        },
    )
    # SQLModel table instance can serialize to {} under current FastAPI stack — return plain dict.
    return row.model_dump()


def ticket_approval_status(
    session: SessionDep,
    user: CurrentUser,
    project_id: int,
    stage: str,
    task: str,
):
    """Used by nhx human sensors.

    An approved ticket permanently passing the same stage/task is incorrect for
    repeated executions. Approval must cover the latest deliverable cutoff:
    max(latest artifact updated_at, latest task-shell run_at). After a new shell
    run or artifact submit, a fresh human-check approval is required.
    """
    _require_project_member(session, user, project_id)
    arts = _artifacts_for_scope(session, project_id, stage, task, "")
    latest_art = None
    latest_art_at: datetime | None = None
    for a in arts:
        at = _as_utc(a.updated_at)
        if at is None:
            continue
        if latest_art_at is None or at > latest_art_at:
            latest_art_at = at
            latest_art = a

    shell_rows = session.exec(
        select(TaskShellRunLog).where(
            TaskShellRunLog.project_id == project_id,
            TaskShellRunLog.stage == stage,
            TaskShellRunLog.task_id == task,
        )
    ).all()
    latest_shell_at: datetime | None = None
    for r in shell_rows:
        at = _as_utc(r.run_at)
        if at is None:
            continue
        if latest_shell_at is None or at > latest_shell_at:
            latest_shell_at = at

    cutoff_candidates = [t for t in (latest_art_at, latest_shell_at) if t is not None]
    cutoff_at = max(cutoff_candidates) if cutoff_candidates else None

    rows = session.exec(
        select(Ticket).where(
            Ticket.project_id == project_id,
            Ticket.stage == stage,
            Ticket.task == task,
            Ticket.ticket_type == "human-check",
        )
    ).all()

    def _ticket_time(t: Ticket) -> datetime | None:
        return _as_utc(t.updated_at) or _as_utc(t.created_at)

    def _covers_latest(t: Ticket) -> bool:
        if t.status != "approved":
            return False
        if cutoff_at is None:
            return True
        tt = _ticket_time(t)
        return tt is not None and tt >= cutoff_at

    def _pending_for_latest(t: Ticket) -> bool:
        if t.status not in ("draft", "submitted"):
            return False
        if cutoff_at is None:
            return True
        tt = _ticket_time(t)
        return tt is not None and tt >= cutoff_at

    approved = [t for t in rows if _covers_latest(t)]
    pending = [t for t in rows if _pending_for_latest(t)]
    return {
        "approved": len(approved) > 0,
        "pending": len(pending) > 0,
        "approved_tickets": [t.model_dump() for t in approved],
        "pending_tickets": [t.model_dump() for t in pending],
        "latest_artifact": (
            {
                "id": latest_art.id,
                "name": latest_art.name,
                "latest_version": latest_art.latest_version,
                "updated_at": latest_art.updated_at,
            }
            if latest_art
            else None
        ),
        "cutoff_at": cutoff_at.isoformat() if cutoff_at else None,
    }


@router.get("/tickets/approval-status")
def ticket_approval_status_route(
    session: SessionDep,
    user: CurrentUser,
    project_id: int,
    stage: str,
    task: str,
):
    return ticket_approval_status(session, user, project_id, stage, task)


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(Ticket, ticket_id)
    if not row:
        raise HTTPException(404)
    _require_project_member(session, user, row.project_id)
    p = session.get(Project, row.project_id)
    arts = _artifacts_for_scope(
        session,
        row.project_id,
        row.stage or "",
        row.task or "",
        row.artifact_name or "",
    )
    # If named artifact missing, still show all scope artifacts for review context
    if (row.artifact_name or "").strip() and not arts:
        arts = _artifacts_for_scope(session, row.project_id, row.stage or "", row.task or "", "")
    return {
        **row.model_dump(),
        "project_name": p.name if p else "",
        "artifacts": _ticket_artifact_payloads(arts),
    }


@router.post("/tickets/{ticket_id}/submit")
def submit_ticket(ticket_id: int, session: SessionDep, user: CurrentUser):
    row = session.get(Ticket, ticket_id)
    if not row:
        raise HTTPException(404)
    _require_project_member(session, user, row.project_id)
    if row.status != "draft":
        raise HTTPException(400, f"cannot submit from {row.status}")
    if (row.ticket_type or "") == "human-check":
        _require_human_check_artifacts(
            session,
            project_id=row.project_id,
            stage=row.stage or "",
            task=row.task or "",
            artifact_name=row.artifact_name or "",
        )
    row.status = "submitted"
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        row.project_id,
        user,
        "ticket_submit",
        f"提交工单 {row.ticket_no}"
        + (f" {row.stage}/{row.task}" if row.stage or row.task else ""),
        {
            "ticket_id": row.id,
            "ticket_no": row.ticket_no,
            "ticket_type": row.ticket_type,
            "stage": row.stage,
            "task": row.task,
            "status": row.status,
        },
    )
    return row.model_dump()


@router.post("/tickets/{ticket_id}/approve")
def approve_ticket(ticket_id: int, body: TicketDecisionIn, session: SessionDep, user: CurrentUser):
    row = session.get(Ticket, ticket_id)
    if not row:
        raise HTTPException(404)
    if row.status != "submitted":
        raise HTTPException(400, f"cannot approve from {row.status}")
    row.status = "approved"
    row.decision_note = body.note
    row.decided_by = user.username
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        row.project_id,
        user,
        "ticket_approve",
        f"批准工单 {row.ticket_no}"
        + (f" {row.stage}/{row.task}" if row.stage or row.task else ""),
        {
            "ticket_id": row.id,
            "ticket_no": row.ticket_no,
            "ticket_type": row.ticket_type,
            "stage": row.stage,
            "task": row.task,
            "note": body.note,
            "status": row.status,
        },
    )
    return row.model_dump()


@router.post("/tickets/{ticket_id}/reject")
def reject_ticket(ticket_id: int, body: TicketDecisionIn, session: SessionDep, user: CurrentUser):
    row = session.get(Ticket, ticket_id)
    if not row:
        raise HTTPException(404)
    if row.status != "submitted":
        raise HTTPException(400, f"cannot reject from {row.status}")
    row.status = "rejected"
    row.decision_note = body.note
    row.decided_by = user.username
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    write_project_log(
        session,
        row.project_id,
        user,
        "ticket_reject",
        f"驳回工单 {row.ticket_no}"
        + (f" {row.stage}/{row.task}" if row.stage or row.task else ""),
        {
            "ticket_id": row.id,
            "ticket_no": row.ticket_no,
            "ticket_type": row.ticket_type,
            "stage": row.stage,
            "task": row.task,
            "note": body.note,
            "status": row.status,
        },
    )
    return row.model_dump()


# ---- Project GitHub sync ----


def _write_project_bundle(session: SessionDep, project: Project, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    meta = {
        "name": project.name,
        "slug": project.slug,
        "profile": project.profile_key,
        "config": json.loads(project.config_json or "{}"),
    }
    (dest / "project.yaml").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    guides = session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project.id)).all()
    gdir = dest / "guides"
    gdir.mkdir(exist_ok=True)
    for g in guides:
        (gdir / f"{g.asset_id}.md").write_text(g.content or "", encoding="utf-8")

    sensors = session.exec(select(ProjectSensor).where(ProjectSensor.project_id == project.id)).all()
    sdir = dest / "sensors"
    sdir.mkdir(exist_ok=True)
    for s in sensors:
        (sdir / f"{s.asset_id}.md").write_text(s.content or "", encoding="utf-8")

    arts = session.exec(select(Artifact).where(Artifact.project_id == project.id)).all()
    adir = dest / "artifacts"
    adir.mkdir(exist_ok=True)
    for a in arts:
        versions = session.exec(select(ArtifactVersion).where(ArtifactVersion.artifact_id == a.id)).all()
        if not versions:
            continue
        latest = sorted(versions, key=lambda v: v.version, reverse=True)[0]
        src = Path(latest.storage_path)
        if not src.exists():
            continue
        if src.is_dir():
            target = adir / f"{a.name}_v{latest.version}"
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(src, target)
        elif src.is_file():
            target = adir / f"{a.name}_v{latest.version}{src.suffix}"
            target.write_bytes(src.read_bytes())
    return dest


@router.post("/projects/{project_id}/github/sync")
def sync_project_github(project_id: int, session: SessionDep, user: CurrentUser, message: str = "chore: sync project HX"):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    if not project.github_repo:
        raise HTTPException(400, "project github_repo not configured")
    settings = get_settings()
    bundle = settings.repos_dir / f"project-bundle-{project.slug}"
    _write_project_bundle(session, project, bundle)
    work = settings.repos_dir / f"project-{project.slug}"
    org = session.exec(select(OrgSettings).where(OrgSettings.org_id == "default")).first()
    project_token = (project.github_token or "").strip()
    org_token = ((org.github_token if org else "") or "").strip()
    env_token = (settings.github_token or "").strip()
    # Prefer project PAT, then org HX settings, then env
    token = project_token or org_token or env_token
    if not token:
        raise HTTPException(400, "请配置项目 GitHub Token（读写 PAT），或在组织设置中配置可用 Token")
    result = github_svc.commit_and_push(
        work, project.github_repo, project.github_branch or "main", token, message, source=bundle
    )
    job = SyncJob(
        project_id=project_id,
        status="success" if result.ok else "failed",
        remote=project.github_repo,
        branch=project.github_branch,
        commit_sha=result.commit_sha,
        message=result.message,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    write_project_log(
        session,
        project_id,
        user,
        "github_sync",
        f"GitHub 同步{'成功' if result.ok else '失败'}: {result.message[:120]}",
        {
            "ok": result.ok,
            "commit_sha": result.commit_sha,
            "job_id": job.id,
            "remote": project.github_repo,
            "branch": project.github_branch,
        },
    )
    return {"ok": result.ok, "message": result.message, "commit_sha": result.commit_sha, "job_id": job.id}


@router.get("/projects/{project_id}/github/jobs")
def list_sync_jobs(project_id: int, session: SessionDep, user: CurrentUser):
    _require_project_member(session, user, project_id)
    rows = session.exec(select(SyncJob).where(SyncJob.project_id == project_id)).all()
    return sorted(rows, key=lambda r: r.id or 0, reverse=True)


@router.get("/github/sync-overview")
def sync_overview(session: SessionDep, user: CurrentUser):
    if _is_org_admin(user):
        projects = session.exec(select(Project)).all()
    else:
        memberships = session.exec(select(ProjectMember).where(ProjectMember.user_id == user.id)).all()
        pids = {m.project_id for m in memberships}
        projects = [p for p in session.exec(select(Project)).all() if p.id in pids]
    out = []
    for p in projects:
        jobs = session.exec(select(SyncJob).where(SyncJob.project_id == p.id)).all()
        jobs_sorted = sorted(jobs, key=lambda r: r.id or 0, reverse=True)
        last = jobs_sorted[0] if jobs_sorted else None
        arts = session.exec(select(Artifact).where(Artifact.project_id == p.id)).all()
        out.append(
            {
                "project_id": p.id,
                "project_name": p.name,
                "github_repo": p.github_repo,
                "github_token_configured": bool((p.github_token or "").strip()),
                "last_sync": last.created_at if last else None,
                "last_status": last.status if last else "never",
                "artifact_count": len(arts),
            }
        )
    return out


# ---- Asset promotion (project → org) ----


class AssetSubmitItemIn(BaseModel):
    asset_kind: str  # guide|sensor
    asset_id: str


class AssetSubmissionCreateIn(BaseModel):
    reason: str
    items: list[AssetSubmitItemIn] = Field(default_factory=list)


@router.get("/projects/{project_id}/promotable-assets")
def get_promotable_assets(project_id: int, session: SessionDep, user: CurrentUser):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    return list_promotable(session, project)


@router.get("/projects/{project_id}/asset-submissions")
def list_project_asset_submissions(project_id: int, session: SessionDep, user: CurrentUser):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    rows = session.exec(
        select(AssetSubmission).where(AssetSubmission.project_id == project_id)
    ).all()
    rows = sorted(rows, key=lambda r: r.id or 0, reverse=True)
    return [submission_payload(session, r) for r in rows]


@router.post("/projects/{project_id}/asset-submissions")
def post_project_asset_submission(
    project_id: int,
    body: AssetSubmissionCreateIn,
    session: SessionDep,
    user: CurrentUser,
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    _require_project_member(session, user, project_id)
    sub = create_submission(
        session,
        project,
        reason=body.reason,
        items=[i.model_dump() for i in body.items],
        submitter=user.username or user.display_name or "",
    )
    return submission_payload(session, sub)
