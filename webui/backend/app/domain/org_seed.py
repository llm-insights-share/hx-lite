"""Export / import bundled org catalog + demo projects seed."""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from app.core.config import BACKEND_ROOT, get_settings
from app.core.models import (
    CommandShell,
    Guide,
    OrgSettings,
    Profile,
    Project,
    ProjectGuide,
    ProjectSensor,
    ProjectTask,
    Sensor,
    StageTask,
)
from app.domain.bootstrap import _clear_org

SEED_DIR = BACKEND_ROOT / "seed" / "org-default"
SEED_VERSION = "1.0"


def seed_available(seed_dir: Path | None = None) -> bool:
    root = seed_dir or SEED_DIR
    return (root / "manifest.json").is_file()


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _read_json(path: Path, default: Any = None) -> Any:
    if not path.is_file():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9\-]+", "-", (name or "").strip().lower()).strip("-")
    return s or "project"


def _copy_tree(src: Path, dst: Path) -> int:
    if not src.is_dir():
        return 0
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    return sum(1 for p in dst.rglob("*") if p.is_file())


def export_org_seed(
    session: Session,
    org_id: str = "default",
    dest: Path | None = None,
) -> dict[str, Any]:
    """Snapshot org catalog + all projects into seed directory."""
    root = dest or SEED_DIR
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    data_dir = get_settings().data_dir

    settings = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
    _write_json(
        root / "org_settings.json",
        {
            "org_id": org_id,
            "org_name": settings.org_name if settings else "Default Org",
            "github_repo": "",
            "github_branch": (settings.github_branch if settings else "") or "main",
            "guide_kinds_json": settings.guide_kinds_json if settings else "[]",
            "path_layout_json": settings.path_layout_json if settings else "",
        },
    )

    profiles = session.exec(select(Profile).where(Profile.org_id == org_id)).all()
    _write_json(
        root / "profiles.json",
        [
            {
                "key": p.key,
                "title": p.title,
                "description": p.description,
                "stages_json": p.stages_json,
            }
            for p in profiles
        ],
    )

    stage_tasks = session.exec(select(StageTask).where(StageTask.org_id == org_id)).all()
    _write_json(
        root / "stage_tasks.json",
        [
            {
                "profile_key": t.profile_key,
                "stage": t.stage,
                "task_id": t.task_id,
                "title_zh": t.title_zh,
                "title_en": t.title_en,
                "required": t.required,
                "suite": t.suite,
                "guides_json": t.guides_json,
                "sensors_json": t.sensors_json,
                "enabled": t.enabled,
                "sort_order": t.sort_order,
            }
            for t in stage_tasks
        ],
    )

    guides = session.exec(select(Guide).where(Guide.org_id == org_id)).all()
    _write_json(
        root / "guides.json",
        [
            {
                "asset_id": g.asset_id,
                "name": g.name,
                "kind": g.kind,
                "stage": g.stage,
                "task": g.task,
                "version": g.version,
                "status": g.status,
                "source": g.source,
                "content": g.content,
                "content_mode": g.content_mode,
                "package_path": g.package_path,
                "package_files_json": g.package_files_json,
                "ref_skills_json": g.ref_skills_json,
            }
            for g in guides
        ],
    )

    sensors = session.exec(select(Sensor).where(Sensor.org_id == org_id)).all()
    _write_json(
        root / "sensors.json",
        [
            {
                "asset_id": s.asset_id,
                "name": s.name,
                "kind": s.kind,
                "stage": s.stage,
                "task": s.task,
                "version": s.version,
                "status": s.status,
                "check_type": s.check_type,
                "triggers_json": s.triggers_json,
                "scope_json": s.scope_json,
                "config_json": s.config_json,
                "content": s.content,
            }
            for s in sensors
        ],
    )

    shells = session.exec(select(CommandShell).where(CommandShell.org_id == org_id)).all()
    _write_json(
        root / "command_shells.json",
        [
            {
                "stage": c.stage,
                "task": c.task,
                "slash_name": c.slash_name,
                "description": c.description,
                "body": c.body,
                "appendix": c.appendix,
                "impl": c.impl,
            }
            for c in shells
        ],
    )

    org_pkg_src = data_dir / "guide-packages" / org_id
    org_pkg_files = _copy_tree(org_pkg_src, root / "packages" / "org")

    projects = session.exec(select(Project).order_by(Project.id)).all()  # type: ignore[arg-type]
    projects_out: list[dict[str, Any]] = []
    tasks_out: list[dict[str, Any]] = []
    guides_out: list[dict[str, Any]] = []
    sensors_out: list[dict[str, Any]] = []
    proj_pkg_files = 0

    for p in projects:
        seed_key = (p.slug or _slugify(p.name)).strip() or f"project-{p.id}"
        projects_out.append(
            {
                "seed_key": seed_key,
                "name": p.name,
                "slug": seed_key,
                "profile_key": p.profile_key,
                "github_repo": "",
                "github_branch": p.github_branch or "main",
                "current_stage": p.current_stage,
                "current_task": p.current_task,
                "description": p.description,
                "config_json": p.config_json or "{}",
            }
        )
        assert p.id is not None
        for t in session.exec(select(ProjectTask).where(ProjectTask.project_id == p.id)).all():
            tasks_out.append(
                {
                    "seed_key": seed_key,
                    "stage": t.stage,
                    "task_id": t.task_id,
                    "title": t.title,
                    "required": t.required,
                    "suite": t.suite,
                    "guides_json": t.guides_json,
                    "sensors_json": t.sensors_json,
                    "custom": t.custom,
                    "sort_order": t.sort_order,
                }
            )
        for g in session.exec(select(ProjectGuide).where(ProjectGuide.project_id == p.id)).all():
            guides_out.append(
                {
                    "seed_key": seed_key,
                    "asset_id": g.asset_id,
                    "name": g.name,
                    "kind": g.kind,
                    "stage": g.stage,
                    "task": g.task,
                    "content": g.content,
                    "status": g.status,
                    "source": g.source,
                    "version": g.version,
                    "content_mode": g.content_mode,
                    "package_path": g.package_path,
                    "package_files_json": g.package_files_json,
                    "ref_skills_json": g.ref_skills_json,
                }
            )
        for s in session.exec(select(ProjectSensor).where(ProjectSensor.project_id == p.id)).all():
            sensors_out.append(
                {
                    "seed_key": seed_key,
                    "asset_id": s.asset_id,
                    "name": s.name,
                    "kind": s.kind,
                    "stage": s.stage,
                    "task": s.task,
                    "check_type": s.check_type,
                    "triggers_json": s.triggers_json,
                    "scope_json": s.scope_json,
                    "content": s.content,
                }
            )
        pkg_src = data_dir / "guide-packages" / "project" / str(p.id)
        if pkg_src.is_dir():
            proj_pkg_files += _copy_tree(pkg_src, root / "packages" / "project" / seed_key)

    _write_json(root / "projects.json", projects_out)
    _write_json(root / "project_tasks.json", tasks_out)
    _write_json(root / "project_guides.json", guides_out)
    _write_json(root / "project_sensors.json", sensors_out)

    manifest = {
        "version": SEED_VERSION,
        "org_id": org_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "profiles": len(profiles),
            "stage_tasks": len(stage_tasks),
            "guides": len(guides),
            "sensors": len(sensors),
            "command_shells": len(shells),
            "org_package_files": org_pkg_files,
            "projects": len(projects_out),
            "project_tasks": len(tasks_out),
            "project_guides": len(guides_out),
            "project_sensors": len(sensors_out),
            "project_package_files": proj_pkg_files,
        },
    }
    _write_json(root / "manifest.json", manifest)
    return manifest


def _import_org_catalog(session: Session, org_id: str, root: Path, *, clear_org: bool) -> dict[str, int]:
    if clear_org:
        _clear_org(session, org_id)

    settings_data = _read_json(root / "org_settings.json", {}) or {}
    settings = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
    if not settings:
        settings = OrgSettings(org_id=org_id)
    settings.org_name = settings_data.get("org_name") or settings.org_name or "Default Org"
    settings.github_branch = settings_data.get("github_branch") or settings.github_branch or "main"
    # never import token
    settings.guide_kinds_json = settings_data.get("guide_kinds_json") or "[]"
    settings.path_layout_json = settings_data.get("path_layout_json") or ""
    settings.updated_at = datetime.now(timezone.utc)
    session.add(settings)

    for row in _read_json(root / "profiles.json", []) or []:
        session.add(
            Profile(
                org_id=org_id,
                key=row["key"],
                title=row.get("title") or "",
                description=row.get("description") or "",
                stages_json=row.get("stages_json") or "[]",
            )
        )

    for row in _read_json(root / "stage_tasks.json", []) or []:
        session.add(
            StageTask(
                org_id=org_id,
                profile_key=row.get("profile_key") or "*",
                stage=row["stage"],
                task_id=row["task_id"],
                title_zh=row.get("title_zh") or "",
                title_en=row.get("title_en") or "",
                required=bool(row.get("required", True)),
                suite=row.get("suite") or "",
                guides_json=row.get("guides_json") or "[]",
                sensors_json=row.get("sensors_json") or "[]",
                enabled=bool(row.get("enabled", True)),
                sort_order=int(row.get("sort_order") or 0),
            )
        )

    for row in _read_json(root / "guides.json", []) or []:
        session.add(
            Guide(
                org_id=org_id,
                asset_id=row["asset_id"],
                name=row.get("name") or "",
                kind=row.get("kind") or "guide.skill",
                stage=row.get("stage") or "",
                task=row.get("task") or "",
                version=row.get("version") or "1.0.0",
                status=row.get("status") or "enforced",
                source=row.get("source") or "",
                content=row.get("content") or "",
                content_mode=row.get("content_mode") or "markdown",
                package_path=row.get("package_path") or "",
                package_files_json=row.get("package_files_json") or "[]",
                ref_skills_json=row.get("ref_skills_json") or "[]",
            )
        )

    for row in _read_json(root / "sensors.json", []) or []:
        session.add(
            Sensor(
                org_id=org_id,
                asset_id=row["asset_id"],
                name=row.get("name") or "",
                kind=row.get("kind") or "sensor.rule",
                stage=row.get("stage") or "",
                task=row.get("task") or "",
                version=row.get("version") or "1.0.0",
                status=row.get("status") or "enforced",
                check_type=row.get("check_type") or "rules",
                triggers_json=row.get("triggers_json") or '["hook:stop","cli","task-shell"]',
                scope_json=row.get("scope_json") or "[]",
                config_json=row.get("config_json") or "{}",
                content=row.get("content") or "",
            )
        )

    for row in _read_json(root / "command_shells.json", []) or []:
        session.add(
            CommandShell(
                org_id=org_id,
                stage=row["stage"],
                task=row["task"],
                slash_name=row.get("slash_name") or "",
                description=row.get("description") or "",
                body=row.get("body") or "",
                appendix=row.get("appendix") or "",
                impl=row.get("impl") or "both",
            )
        )

    session.commit()

    data_dir = get_settings().data_dir
    org_pkg_dst = data_dir / "guide-packages" / org_id
    org_pkg_src = root / "packages" / "org"
    pkg_files = 0
    if org_pkg_src.is_dir():
        pkg_files = _copy_tree(org_pkg_src, org_pkg_dst)

    return {
        "profiles": len(_read_json(root / "profiles.json", []) or []),
        "stage_tasks": len(_read_json(root / "stage_tasks.json", []) or []),
        "guides": len(_read_json(root / "guides.json", []) or []),
        "sensors": len(_read_json(root / "sensors.json", []) or []),
        "command_shells": len(_read_json(root / "command_shells.json", []) or []),
        "org_package_files": pkg_files,
    }


def ensure_demo_projects(
    session: Session,
    org_id: str = "default",
    seed_dir: Path | None = None,
) -> dict[str, Any]:
    """Idempotently create missing demo projects from seed (skip existing seed_key/slug)."""
    root = seed_dir or SEED_DIR
    projects = _read_json(root / "projects.json", []) or []
    if not projects:
        return {"created": 0, "skipped": 0, "projects": []}

    tasks_by_key: dict[str, list[dict[str, Any]]] = {}
    for row in _read_json(root / "project_tasks.json", []) or []:
        tasks_by_key.setdefault(row["seed_key"], []).append(row)
    guides_by_key: dict[str, list[dict[str, Any]]] = {}
    for row in _read_json(root / "project_guides.json", []) or []:
        guides_by_key.setdefault(row["seed_key"], []).append(row)
    sensors_by_key: dict[str, list[dict[str, Any]]] = {}
    for row in _read_json(root / "project_sensors.json", []) or []:
        sensors_by_key.setdefault(row["seed_key"], []).append(row)

    data_dir = get_settings().data_dir
    created = 0
    skipped = 0
    created_keys: list[str] = []

    for prow in projects:
        seed_key = prow.get("seed_key") or prow.get("slug") or _slugify(prow.get("name") or "")
        existing = session.exec(select(Project).where(Project.slug == seed_key)).first()
        if existing:
            skipped += 1
            continue

        project = Project(
            name=prow.get("name") or seed_key,
            slug=seed_key,
            profile_key=prow.get("profile_key") or "standard",
            github_repo="",
            github_branch=prow.get("github_branch") or "main",
            github_token="",
            current_stage=prow.get("current_stage") or "req",
            current_task=prow.get("current_task") or "",
            description=prow.get("description") or "",
            config_json=prow.get("config_json") or "{}",
        )
        session.add(project)
        session.commit()
        session.refresh(project)
        assert project.id is not None

        for row in tasks_by_key.get(seed_key, []):
            session.add(
                ProjectTask(
                    project_id=project.id,
                    stage=row["stage"],
                    task_id=row["task_id"],
                    title=row.get("title") or "",
                    required=bool(row.get("required", False)),
                    suite=row.get("suite") or "",
                    guides_json=row.get("guides_json") or "[]",
                    sensors_json=row.get("sensors_json") or "[]",
                    custom=bool(row.get("custom", True)),
                    sort_order=int(row.get("sort_order") or 0),
                )
            )

        pkg_src = root / "packages" / "project" / seed_key
        if pkg_src.is_dir():
            pkg_dst = data_dir / "guide-packages" / "project" / str(project.id)
            _copy_tree(pkg_src, pkg_dst)

        for row in guides_by_key.get(seed_key, []):
            package_path = row.get("package_path") or ""
            # Remap any historical numeric project id in path to new id
            m = re.match(r"guide-packages/project/(\d+|[^/]+)/(.*)", package_path)
            if m and row.get("content_mode") == "package":
                package_path = f"guide-packages/project/{project.id}/{m.group(2)}"
            elif package_path.startswith(f"guide-packages/project/{seed_key}/"):
                package_path = (
                    f"guide-packages/project/{project.id}/"
                    + package_path[len(f"guide-packages/project/{seed_key}/") :]
                )
            session.add(
                ProjectGuide(
                    project_id=project.id,
                    asset_id=row["asset_id"],
                    name=row.get("name") or "",
                    kind=row.get("kind") or "guide.skill",
                    stage=row.get("stage") or "",
                    task=row.get("task") or "",
                    content=row.get("content") or "",
                    status=row.get("status") or "draft",
                    source=row.get("source") or "",
                    version=row.get("version") or "1.0.0",
                    content_mode=row.get("content_mode") or "markdown",
                    package_path=package_path,
                    package_files_json=row.get("package_files_json") or "[]",
                    ref_skills_json=row.get("ref_skills_json") or "[]",
                )
            )

        for row in sensors_by_key.get(seed_key, []):
            session.add(
                ProjectSensor(
                    project_id=project.id,
                    asset_id=row["asset_id"],
                    name=row.get("name") or "",
                    kind=row.get("kind") or "sensor.rule",
                    stage=row.get("stage") or "",
                    task=row.get("task") or "",
                    check_type=row.get("check_type") or "rules",
                    triggers_json=row.get("triggers_json") or '["hook:stop","cli","task-shell"]',
                    scope_json=row.get("scope_json") or "[]",
                    content=row.get("content") or "",
                )
            )

        session.commit()
        created += 1
        created_keys.append(seed_key)

    return {"created": created, "skipped": skipped, "projects": created_keys, "org_id": org_id}


def import_org_seed(
    session: Session,
    org_id: str = "default",
    *,
    clear_org: bool = True,
    seed_dir: Path | None = None,
    include_projects: bool = True,
) -> dict[str, Any]:
    """Load org catalog from seed; optionally ensure demo projects."""
    root = seed_dir or SEED_DIR
    if not seed_available(root):
        raise FileNotFoundError(f"org seed not found: {root / 'manifest.json'}")

    org_counts = _import_org_catalog(session, org_id, root, clear_org=clear_org)
    result: dict[str, Any] = {
        "org_id": org_id,
        "source": "seed",
        "seed_dir": str(root),
        **org_counts,
    }
    if include_projects:
        result["demo_projects"] = ensure_demo_projects(session, org_id=org_id, seed_dir=root)
    return result


def ensure_org_seeded(session: Session, org_id: str = "default") -> dict[str, Any]:
    """On empty org catalog, import seed; always try to fill missing demo projects."""
    if not seed_available():
        demo = ensure_demo_projects(session, org_id=org_id) if (SEED_DIR / "projects.json").is_file() else {
            "created": 0,
            "skipped": 0,
            "projects": [],
        }
        return {"imported_org": False, "reason": "no_seed", "demo_projects": demo}

    has_tasks = session.exec(select(StageTask).where(StageTask.org_id == org_id)).first()
    imported = False
    org_result: dict[str, Any] = {}
    if not has_tasks:
        # clear sample-only guides so full seed is authoritative
        org_result = import_org_seed(
            session,
            org_id=org_id,
            clear_org=True,
            include_projects=False,
        )
        imported = True
    demo = ensure_demo_projects(session, org_id=org_id)
    return {"imported_org": imported, "org": org_result, "demo_projects": demo}
