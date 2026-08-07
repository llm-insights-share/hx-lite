"""Materialize project HX config from organization profile assets."""

from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session, select

from app.core.models import (
    Guide,
    Profile,
    Project,
    ProjectGuide,
    ProjectSensor,
    ProjectTask,
    Sensor,
    StageTask,
    TaskShellRunLog,
)
from app.domain.guide_package import (
    effective_guide_fields,
    load_package_blobs,
    parse_package_files_json,
)
from app.domain.ref_skills import parse_ref_skills_json


def _org_id_from_project(project: Project) -> str:
    try:
        cfg = json.loads(project.config_json or "{}")
        if isinstance(cfg.get("org_id"), str) and cfg["org_id"]:
            return cfg["org_id"]
    except json.JSONDecodeError:
        pass
    return "default"


def _effective_project_guide_item(
    g: ProjectGuide,
    org_by_aid: dict[str, Guide] | None = None,
) -> dict[str, Any]:
    """Flat guide dict with org package overlay when source is org."""
    source = (getattr(g, "source", None) or "").strip()
    og = (org_by_aid or {}).get(g.asset_id)
    if not source:
        source = "org" if og else "project"
    eff = effective_guide_fields(
        source=source,
        row_content=g.content or "",
        row_content_mode=getattr(g, "content_mode", None) or "markdown",
        row_package_path=getattr(g, "package_path", None) or "",
        row_package_files_json=getattr(g, "package_files_json", None) or "[]",
        row_kind=g.kind or "",
        org=og if source == "org" else None,
    )
    refs_raw = (
        getattr(og, "ref_skills_json", None)
        if source == "org" and og is not None
        else getattr(g, "ref_skills_json", None)
    )
    return {
        "asset_id": g.asset_id,
        "name": (getattr(g, "name", None) or g.asset_id or "")[:20],
        "kind": eff["kind"] or g.kind,
        "stage": g.stage,
        "task": g.task,
        "content": eff["content"],
        "content_mode": eff["content_mode"],
        "package_path": eff["package_path"],
        "package_files": eff["package_files"],
        "primary_file": eff["primary_file"],
        "ref_skills": parse_ref_skills_json(refs_raw),
        "source": source,
    }


def _project_stage_ids(project: Project) -> list[str]:
    try:
        cfg = json.loads(project.config_json or "{}")
    except json.JSONDecodeError:
        cfg = {}
    stages = cfg.get("stages") or []
    return [str(s).strip() for s in stages if str(s).strip()]


def advance_project_cursor(
    session: Session,
    project: Project,
    stage: str,
    task_id: str = "",
) -> bool:
    """Update Project.current_stage / current_task when a known stage is entered.

    Returns True if either stored value changed.
    """
    stage = (stage or "").strip()
    task_id = (task_id or "").strip()
    if not stage:
        return False
    known = _project_stage_ids(project)
    if known and stage not in known:
        return False
    changed = False
    if (project.current_stage or "").strip() != stage:
        project.current_stage = stage
        changed = True
    if task_id and (getattr(project, "current_task", None) or "").strip() != task_id:
        project.current_task = task_id
        changed = True
    if changed:
        session.add(project)
    return changed


def advance_project_current_stage(session: Session, project: Project, stage: str) -> bool:
    """Backward-compatible alias: advance stage only."""
    return advance_project_cursor(session, project, stage, "")


def heal_current_stage_from_shell_logs(session: Session, project: Project) -> bool:
    """Align current_stage / current_task with the latest TaskShellRunLog."""
    if project.id is None:
        return False
    rows = list(
        session.exec(select(TaskShellRunLog).where(TaskShellRunLog.project_id == project.id)).all()
    )
    if not rows:
        return False
    top = max(rows, key=lambda r: str(r.run_at or ""))
    return advance_project_cursor(session, project, top.stage or "", top.task_id or "")


def _load_profile_tasks(session: Session, org_id: str, profile_key: str) -> list[StageTask]:
    tasks = session.exec(
        select(StageTask).where(
            StageTask.org_id == org_id,
            StageTask.profile_key == profile_key,
            StageTask.enabled == True,  # noqa: E712
        )
    ).all()
    if not tasks:
        tasks = session.exec(
            select(StageTask).where(
                StageTask.org_id == org_id,
                StageTask.profile_key == "*",
                StageTask.enabled == True,  # noqa: E712
            )
        ).all()
    return sorted(list(tasks), key=lambda t: (t.stage, getattr(t, "sort_order", 0) or 0, t.id or 0))


def _guide_map(session: Session, org_id: str) -> dict[str, Guide]:
    rows = session.exec(select(Guide).where(Guide.org_id == org_id)).all()
    return {g.asset_id: g for g in rows}


def _sensor_map(session: Session, org_id: str) -> dict[str, Sensor]:
    rows = session.exec(select(Sensor).where(Sensor.org_id == org_id)).all()
    return {s.asset_id: s for s in rows}


def build_project_hx_view(session: Session, project: Project) -> dict[str, Any]:
    """Structured view: stages → tasks → bound guides/sensors, plus full asset library."""
    tasks = list(session.exec(select(ProjectTask).where(ProjectTask.project_id == project.id)).all())
    guides = session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project.id)).all()
    sensors = session.exec(select(ProjectSensor).where(ProjectSensor.project_id == project.id)).all()

    org_id = _org_id_from_project(project)
    org_by_aid = {
        g.asset_id: g
        for g in session.exec(select(Guide).where(Guide.org_id == org_id)).all()
    }

    guides_by_key: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    guides_flat: list[dict[str, Any]] = []
    for g in guides:
        item = _effective_project_guide_item(g, org_by_aid)
        guides_flat.append(item)
        guides_by_key.setdefault((g.stage, g.task, g.asset_id), []).append(item)
        # also index by asset only for loose binding
        guides_by_key.setdefault(("", "", g.asset_id), []).append(item)

    sensors_by_id: dict[str, dict[str, Any]] = {}
    sensors_flat: list[dict[str, Any]] = []
    for s in sensors:
        try:
            triggers = json.loads(getattr(s, "triggers_json", None) or "[]")
        except json.JSONDecodeError:
            triggers = ["hook:stop", "cli", "task-shell"]
        try:
            scope = json.loads(getattr(s, "scope_json", None) or "[]")
        except json.JSONDecodeError:
            scope = []
        item = {
            "asset_id": s.asset_id,
            "name": (getattr(s, "name", None) or s.asset_id or "")[:20],
            "kind": s.kind,
            "stage": s.stage,
            "task": s.task,
            "check_type": s.check_type,
            "content": s.content or "",
            "triggers": triggers if triggers else ["hook:stop", "cli", "task-shell"],
            "scope": scope,
        }
        sensors_flat.append(item)
        sensors_by_id[s.asset_id] = item

    bound_guide_ids: set[str] = set()
    bound_sensor_ids: set[str] = set()
    by_stage: dict[str, list[dict[str, Any]]] = {}
    for t in sorted(
        tasks,
        key=lambda r: (
            0 if not r.custom else 1,
            getattr(r, "sort_order", 0) or 0,
            r.id or 0,
        ),
    ):
        by_stage.setdefault(t.stage, [])
        gids = json.loads(t.guides_json or "[]")
        sids = json.loads(t.sensors_json or "[]")
        bound_guide_ids.update(gids)
        bound_sensor_ids.update(sids)
        task_guides = []
        for gid in gids:
            matched = guides_by_key.get((t.stage, t.task_id, gid)) or guides_by_key.get(("", "", gid))
            if matched:
                task_guides.append(matched[0])
            else:
                task_guides.append({"asset_id": gid, "kind": "guide.unknown", "stage": t.stage, "task": t.task_id, "content": ""})
        task_sensors = []
        for sid in sids:
            if sid in sensors_by_id:
                task_sensors.append(sensors_by_id[sid])
            else:
                task_sensors.append(
                    {
                        "asset_id": sid,
                        "kind": "sensor.unknown",
                        "stage": t.stage,
                        "task": t.task_id,
                        "check_type": "",
                        "content": "",
                        "triggers": ["hook:stop", "cli", "task-shell"],
                        "scope": [],
                    }
                )
        by_stage[t.stage].append(
            {
                "id": t.task_id,
                "title": t.title,
                "required": t.required,
                "custom": t.custom,
                "guides": task_guides,
                "sensors": task_sensors,
            }
        )

    for item in guides_flat:
        item["bound"] = item["asset_id"] in bound_guide_ids
    for item in sensors_flat:
        item["bound"] = item["asset_id"] in bound_sensor_ids

    stage_order = _resolve_project_stage_order(session, project, list(by_stage.keys()))
    stages = [{"id": sid, "tasks": by_stage[sid]} for sid in stage_order if sid in by_stage]
    return {
        "profile": project.profile_key,
        "stages": stages,
        "guides": guides_flat,
        "sensors": sensors_flat,
        "counts": {
            "stages": len(stages),
            "tasks": len(tasks),
            "guides": len(guides_flat),
            "sensors": len(sensors_flat),
            "bound_guides": len(bound_guide_ids),
            "bound_sensors": len(bound_sensor_ids),
        },
    }


def _resolve_project_stage_order(session: Session, project: Project, present: list[str]) -> list[str]:
    """Prefer Profile.stages_json, then config_json.stages, then task-discovered order."""
    preferred: list[str] = []
    org_id = "default"
    try:
        cfg = json.loads(project.config_json or "{}")
        if isinstance(cfg.get("org_id"), str) and cfg["org_id"]:
            org_id = cfg["org_id"]
    except json.JSONDecodeError:
        cfg = {}
    profile = session.exec(
        select(Profile).where(Profile.org_id == org_id, Profile.key == project.profile_key)
    ).first()
    if profile and profile.stages_json:
        try:
            preferred = [s for s in json.loads(profile.stages_json or "[]") if isinstance(s, str)]
        except json.JSONDecodeError:
            preferred = []
    if not preferred:
        preferred = [s for s in (cfg.get("stages") or []) if isinstance(s, str)]
    present_set = set(present)
    ordered = [s for s in preferred if s in present_set]
    ordered.extend([s for s in present if s not in ordered])
    return ordered


def export_project_for_cli(
    session: Session,
    project: Project,
    stages_filter: list[str] | None = None,
) -> dict[str, Any]:
    """
    Read-only export for nhx CLI.
    Filter by stages; include bound guides/sensors + stage-related assets + CommandShell bodies.
    """
    from app.core.models import CommandShell

    view = build_project_hx_view(session, project)
    wanted = {s.strip() for s in (stages_filter or []) if s and s.strip()}
    stages_out = []
    tasks_flat: list[dict[str, Any]] = []
    guide_ids: set[str] = set()
    sensor_ids: set[str] = set()

    org_id = "default"
    cmd_rows = session.exec(select(CommandShell).where(CommandShell.org_id == org_id)).all()
    cmd_by_key = {(c.stage, c.task): c for c in cmd_rows}

    for stage in view.get("stages") or []:
        sid = stage.get("id") or ""
        if wanted and sid not in wanted:
            continue
        stage_tasks = []
        for t in stage.get("tasks") or []:
            tid = t.get("id") or ""
            slash = f"nhx-{sid}-{str(tid).replace('_', '-')}"
            gids = [
                g.get("asset_id")
                for g in (t.get("guides") or [])
                if g.get("asset_id")
                and not str(g.get("asset_id")).startswith("wf-")
                and (g.get("kind") or "") not in ("guide.workflow", "guide.command")
            ]
            sids = [s.get("asset_id") for s in (t.get("sensors") or []) if s.get("asset_id")]
            guide_ids.update(gids)
            sensor_ids.update(sids)
            if tid:
                guide_ids.add(tid)
            skill_ids_clean: list[str] = []
            seen_skills: set[str] = set()
            for g in t.get("guides") or []:
                gid = g.get("asset_id") or ""
                if not gid or gid in seen_skills or gid.startswith("wf-"):
                    continue
                kind = g.get("kind") or ""
                if kind in ("guide.template", "guide.workflow", "guide.command"):
                    continue
                if "template" in gid or gid.endswith("-outline") or gid.endswith("-checklist"):
                    continue
                seen_skills.add(gid)
                skill_ids_clean.append(gid)
            cmd = cmd_by_key.get((sid, tid))
            shell_body = (cmd.body if cmd else "") or ""
            shell_appendix = (cmd.appendix if cmd else "") or ""
            item = {
                "stage": sid,
                "id": tid,
                "title": t.get("title") or tid,
                "required": bool(t.get("required")),
                "custom": bool(t.get("custom")),
                "guides": gids,
                "sensors": sids,
                "skill_ids": skill_ids_clean,
                "slash_name": slash,
                "shell_body": shell_body,
                "shell_appendix": shell_appendix,
            }
            stage_tasks.append(item)
            tasks_flat.append(item)
        stages_out.append({"id": sid, "tasks": stage_tasks})

    guides_by_id = {g["asset_id"]: g for g in (view.get("guides") or [])}
    sensors_by_id = {s["asset_id"]: s for s in (view.get("sensors") or [])}

    # also include guides/sensors whose stage is in wanted (even if unbound)
    if wanted:
        for g in view.get("guides") or []:
            if (g.get("stage") or "") in wanted:
                guide_ids.add(g["asset_id"])
        for s in view.get("sensors") or []:
            if (s.get("stage") or "") in wanted:
                sensor_ids.add(s["asset_id"])

    for t in tasks_flat:
        for sid in t.get("sensors") or []:
            sensor_ids.add(sid)

    guides_out = []
    for gid in sorted(guide_ids):
        g = guides_by_id.get(gid)
        if g:
            guides_out.append(g)
        else:
            guides_out.append(
                {"asset_id": gid, "kind": "guide.unknown", "stage": "", "task": "", "content": "", "bound": False}
            )

    sensors_out = []
    for sid in sorted(sensor_ids):
        s = sensors_by_id.get(sid)
        if s:
            sensors_out.append(s)
        else:
            sensors_out.append(
                {
                    "asset_id": sid,
                    "kind": "sensor.unknown",
                    "stage": "",
                    "task": "",
                    "check_type": "",
                    "content": "",
                    "triggers": ["hook:stop", "cli", "task-shell"],
                    "scope": [],
                    "bound": False,
                }
            )

    # Filter out any leftover workflow guides from export payload
    guides_out = [g for g in guides_out if (g.get("kind") or "") not in ("guide.workflow", "guide.command") and not str(g.get("asset_id") or "").startswith("wf-")]

    # Attach package blobs for CLI materialize (docx/xlsx templates, etc.)
    for g in guides_out:
        mode = (g.get("content_mode") or "").strip().lower()
        pkg_path = (g.get("package_path") or "").strip()
        files = g.get("package_files") if isinstance(g.get("package_files"), list) else []
        if mode == "package" and pkg_path:
            blobs = load_package_blobs(pkg_path, [str(x) for x in files] if files else None)
            g["package_blobs"] = blobs
            if not g.get("primary_file") and files:
                from app.domain.guide_package import pick_primary_package_filename

                g["primary_file"] = pick_primary_package_filename(
                    [str(x) for x in files], g.get("kind") or ""
                )
        else:
            g.setdefault("package_blobs", [])
            g.setdefault("package_files", files if isinstance(files, list) else [])
            g.setdefault("primary_file", g.get("primary_file") or "")
            g.setdefault("content_mode", g.get("content_mode") or "markdown")

    from app.core.models import OrgSettings
    from app.domain.path_layout import parse_path_layout

    settings = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
    path_layout = parse_path_layout(getattr(settings, "path_layout_json", None) if settings else None)

    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "slug": project.slug,
            "profile_key": project.profile_key,
            "github_repo": project.github_repo,
            "github_branch": project.github_branch,
            "current_stage": project.current_stage,
            "current_task": getattr(project, "current_task", None) or "",
        },
        "profile": project.profile_key,
        "stages_filter": sorted(wanted) if wanted else [s["id"] for s in stages_out],
        "stages": stages_out,
        "tasks": tasks_flat,
        "guides": guides_out,
        "sensors": sensors_out,
        "path_layout": path_layout,
        "counts": {
            "stages": len(stages_out),
            "tasks": len(tasks_flat),
            "guides": len(guides_out),
            "sensors": len(sensors_out),
        },
    }


def materialize_project_config(session: Session, project: Project, org_id: str = "default") -> dict[str, Any]:
    """Copy org profile stages/tasks, and ALL org Guide/Sensor assets into the project."""
    profile = session.exec(
        select(Profile).where(Profile.org_id == org_id, Profile.key == project.profile_key)
    ).first()
    org_tasks = _load_profile_tasks(session, org_id, project.profile_key)
    if not org_tasks:
        raise ValueError(
            f"组织 HX 中未找到 profile={project.profile_key} 的任务配置，请先在组织侧完成初始配置生成"
        )

    gmap = _guide_map(session, org_id)
    smap = _sensor_map(session, org_id)

    # clear previous non-custom tasks; refresh org-copied guides/sensors
    for row in session.exec(select(ProjectTask).where(ProjectTask.project_id == project.id)).all():
        if not row.custom:
            session.delete(row)
    for row in session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project.id)).all():
        # Keep project-private guides across re-init; refresh org-copied ones
        if (getattr(row, "source", None) or "") == "project":
            continue
        session.delete(row)
    for row in session.exec(select(ProjectSensor).where(ProjectSensor.project_id == project.id)).all():
        session.delete(row)
    session.commit()

    # Pull ALL org Guide / Sensor assets into the project (not only task-bound ones).
    all_guides = dict(gmap)
    all_sensors = dict(smap)
    task_bindings: list[tuple[StageTask, list[str], list[str]]] = []

    for t in org_tasks:
        guide_ids = [
            g
            for g in json.loads(t.guides_json or "[]")
            if g and not str(g).startswith("wf-")
        ]
        sensor_ids = list(json.loads(t.sensors_json or "[]"))
        task_bindings.append((t, guide_ids, sensor_ids))

    # Skip legacy guide.workflow when copying org assets
    existing_private = {
        g.asset_id
        for g in session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project.id)).all()
        if (getattr(g, "source", None) or "") == "project"
    }
    for g in all_guides.values():
        if (g.kind or "") in ("guide.workflow", "guide.command") or (g.asset_id or "").startswith("wf-"):
            continue
        if g.asset_id in existing_private:
            # private overrides org asset_id — skip org copy
            continue
        session.add(
            ProjectGuide(
                project_id=project.id,
                asset_id=g.asset_id,
                name=(getattr(g, "name", None) or g.asset_id or "")[:20],
                kind=g.kind,
                stage=g.stage or "",
                task=g.task or "",
                content=g.content or "",
                status=getattr(g, "status", None) or "draft",
                source="org",
                version=getattr(g, "version", None) or "1.0.0",
                content_mode=getattr(g, "content_mode", None) or "markdown",
                package_path=getattr(g, "package_path", None) or "",
                package_files_json=getattr(g, "package_files_json", None) or "[]",
                ref_skills_json=getattr(g, "ref_skills_json", None) or "[]",
            )
        )
    for s in all_sensors.values():
        session.add(
            ProjectSensor(
                project_id=project.id,
                asset_id=s.asset_id,
                name=(getattr(s, "name", None) or s.asset_id or "")[:20],
                kind=s.kind,
                stage=s.stage or "",
                task=s.task or "",
                check_type=s.check_type,
                content=s.content or "",
                triggers_json=getattr(s, "triggers_json", None)
                or '["hook:stop","cli","task-shell"]',
                scope_json=getattr(s, "scope_json", None) or "[]",
            )
        )

    by_stage: dict[str, list[dict[str, Any]]] = {}
    for t, guide_ids, sensor_ids in task_bindings:
        pt = ProjectTask(
            project_id=project.id,
            stage=t.stage,
            task_id=t.task_id,
            title=t.title_zh or t.title_en or t.task_id,
            required=t.required,
            suite="",
            guides_json=json.dumps(guide_ids, ensure_ascii=False),
            sensors_json=json.dumps(sensor_ids, ensure_ascii=False),
            custom=False,
            sort_order=getattr(t, "sort_order", 0) or 0,
        )
        session.add(pt)
        by_stage.setdefault(t.stage, []).append(
            {
                "id": t.task_id,
                "title": pt.title,
                "required": t.required,
                "guides": guide_ids,
                "sensors": sensor_ids,
            }
        )

    stage_ids = list(by_stage.keys())
    if profile and profile.stages_json:
        try:
            preferred = json.loads(profile.stages_json or "[]")
            stage_ids = [s for s in preferred if s in by_stage] + [s for s in stage_ids if s not in preferred]
        except json.JSONDecodeError:
            pass

    config = {
        "profile": project.profile_key,
        "org_id": org_id,
        "stages": stage_ids,
        "tasks": {s: by_stage[s] for s in stage_ids},
        "guide_ids": sorted(all_guides.keys()),
        "sensor_ids": sorted(all_sensors.keys()),
        "pulled_all_assets": True,
    }
    project.config_json = json.dumps(config, ensure_ascii=False)
    if stage_ids:
        project.current_stage = stage_ids[0]
    session.add(project)
    session.commit()
    session.refresh(project)
    return build_project_hx_view(session, project)


def _skip_org_guide(g: Guide) -> bool:
    return (g.kind or "") in ("guide.workflow", "guide.command") or (g.asset_id or "").startswith("wf-")


def _norm_json_list(raw: str | None) -> str:
    """Normalize JSON list for set-like equality (order ignored for string lists)."""
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        data = []
    if not isinstance(data, list):
        data = []
    if data and all(isinstance(x, str) for x in data):
        data = sorted(data)
    return json.dumps(data, ensure_ascii=False)


def _norm_json_list_ordered(raw: str | None) -> str:
    """Normalize JSON list preserving order (guides/sensors binding order matters)."""
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        data = []
    if not isinstance(data, list):
        data = []
    return json.dumps(data, ensure_ascii=False)


def _guide_fields_equal(pg: ProjectGuide, g: Guide) -> bool:
    return (
        (pg.content or "") == (g.content or "")
        and (pg.kind or "") == (g.kind or "")
        and (pg.name or "") == ((getattr(g, "name", None) or g.asset_id or "")[:20])
        and (pg.status or "draft") == (getattr(g, "status", None) or "draft")
        and (pg.version or "1.0.0") == (getattr(g, "version", None) or "1.0.0")
        and (pg.content_mode or "markdown") == (getattr(g, "content_mode", None) or "markdown")
        and (getattr(pg, "package_path", None) or "") == (getattr(g, "package_path", None) or "")
        and parse_package_files_json(getattr(pg, "package_files_json", None))
        == parse_package_files_json(getattr(g, "package_files_json", None))
        and (pg.stage or "") == (g.stage or "")
        and (pg.task or "") == (g.task or "")
        and _norm_json_list_ordered(getattr(pg, "ref_skills_json", None))
        == _norm_json_list_ordered(getattr(g, "ref_skills_json", None))
    )


def _sensor_fields_equal(ps: ProjectSensor, s: Sensor) -> bool:
    org_triggers = getattr(s, "triggers_json", None) or '["hook:stop","cli","task-shell"]'
    org_scope = getattr(s, "scope_json", None) or "[]"
    return (
        (ps.content or "") == (s.content or "")
        and (ps.kind or "") == (s.kind or "")
        and (ps.name or "") == ((getattr(s, "name", None) or s.asset_id or "")[:20])
        and (ps.check_type or "") == (s.check_type or "")
        and _norm_json_list(getattr(ps, "triggers_json", None)) == _norm_json_list(org_triggers)
        and _norm_json_list(getattr(ps, "scope_json", None)) == _norm_json_list(org_scope)
        and (ps.stage or "") == (s.stage or "")
        and (ps.task or "") == (s.task or "")
    )


def _apply_guide_from_org(pg: ProjectGuide, g: Guide) -> None:
    pg.kind = g.kind
    pg.name = (getattr(g, "name", None) or g.asset_id or "")[:20]
    pg.stage = g.stage or ""
    pg.task = g.task or ""
    pg.content = g.content or ""
    pg.status = getattr(g, "status", None) or "draft"
    pg.source = "org"
    pg.version = getattr(g, "version", None) or "1.0.0"
    pg.content_mode = getattr(g, "content_mode", None) or "markdown"
    pg.package_path = getattr(g, "package_path", None) or ""
    pg.package_files_json = getattr(g, "package_files_json", None) or "[]"
    pg.ref_skills_json = getattr(g, "ref_skills_json", None) or "[]"


def _apply_sensor_from_org(ps: ProjectSensor, s: Sensor) -> None:
    ps.kind = s.kind
    ps.name = (getattr(s, "name", None) or s.asset_id or "")[:20]
    ps.stage = s.stage or ""
    ps.task = s.task or ""
    ps.check_type = s.check_type
    ps.content = s.content or ""
    ps.triggers_json = getattr(s, "triggers_json", None) or '["hook:stop","cli","task-shell"]'
    ps.scope_json = getattr(s, "scope_json", None) or "[]"


def sync_project_from_org(session: Session, project: Project, org_id: str = "default") -> dict[str, Any]:
    """Incrementally align project HX with org (1B): upsert changed items, remove org-orphaned."""
    profile = session.exec(
        select(Profile).where(Profile.org_id == org_id, Profile.key == project.profile_key)
    ).first()
    org_tasks = _load_profile_tasks(session, org_id, project.profile_key)
    if not org_tasks:
        raise ValueError(
            f"组织 HX 中未找到 profile={project.profile_key} 的任务配置，请先在组织侧完成初始配置生成"
        )

    existing_tasks = session.exec(select(ProjectTask).where(ProjectTask.project_id == project.id)).all()
    if not existing_tasks:
        raise ValueError("项目尚未初始化，请先执行初始化配置")

    gmap = _guide_map(session, org_id)
    smap = _sensor_map(session, org_id)
    org_guides = {aid: g for aid, g in gmap.items() if not _skip_org_guide(g)}
    org_sensors = dict(smap)

    changes: dict[str, Any] = {
        "guides": {"added": [], "updated": [], "removed": []},
        "sensors": {"added": [], "updated": [], "removed": []},
        "tasks": {"added": [], "updated": [], "removed": []},
        "stages": {"before": [], "after": []},
    }

    try:
        prev_cfg = json.loads(project.config_json or "{}")
        changes["stages"]["before"] = list(prev_cfg.get("stages") or [])
    except json.JSONDecodeError:
        changes["stages"]["before"] = []

    project_guides = list(
        session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project.id)).all()
    )
    private_ids = {
        g.asset_id for g in project_guides if (getattr(g, "source", None) or "") == "project"
    }
    guides_by_aid: dict[str, ProjectGuide] = {}
    for g in project_guides:
        # Prefer private when duplicate asset_id (should not happen, but be safe)
        if g.asset_id in guides_by_aid and (getattr(g, "source", None) or "") != "project":
            continue
        guides_by_aid[g.asset_id] = g

    for aid, og in org_guides.items():
        if aid in private_ids:
            continue
        pg = guides_by_aid.get(aid)
        if not pg:
            session.add(
                ProjectGuide(
                    project_id=project.id,
                    asset_id=og.asset_id,
                    name=(getattr(og, "name", None) or og.asset_id or "")[:20],
                    kind=og.kind,
                    stage=og.stage or "",
                    task=og.task or "",
                    content=og.content or "",
                    status=getattr(og, "status", None) or "draft",
                    source="org",
                    version=getattr(og, "version", None) or "1.0.0",
                    content_mode=getattr(og, "content_mode", None) or "markdown",
                    package_path=getattr(og, "package_path", None) or "",
                    package_files_json=getattr(og, "package_files_json", None) or "[]",
                    ref_skills_json=getattr(og, "ref_skills_json", None) or "[]",
                )
            )
            changes["guides"]["added"].append(aid)
        elif (getattr(pg, "source", None) or "") != "project" and not _guide_fields_equal(pg, og):
            _apply_guide_from_org(pg, og)
            session.add(pg)
            changes["guides"]["updated"].append(aid)

    for pg in project_guides:
        src = getattr(pg, "source", None) or ""
        if src == "project":
            continue
        # Treat empty source as org-copied (legacy)
        if pg.asset_id not in org_guides:
            session.delete(pg)
            changes["guides"]["removed"].append(pg.asset_id)

    project_sensors = list(
        session.exec(select(ProjectSensor).where(ProjectSensor.project_id == project.id)).all()
    )
    sensors_by_aid = {s.asset_id: s for s in project_sensors}

    for aid, osen in org_sensors.items():
        ps = sensors_by_aid.get(aid)
        if not ps:
            session.add(
                ProjectSensor(
                    project_id=project.id,
                    asset_id=osen.asset_id,
                    name=(getattr(osen, "name", None) or osen.asset_id or "")[:20],
                    kind=osen.kind,
                    stage=osen.stage or "",
                    task=osen.task or "",
                    check_type=osen.check_type,
                    content=osen.content or "",
                    triggers_json=getattr(osen, "triggers_json", None)
                    or '["hook:stop","cli","task-shell"]',
                    scope_json=getattr(osen, "scope_json", None) or "[]",
                )
            )
            changes["sensors"]["added"].append(aid)
        elif not _sensor_fields_equal(ps, osen):
            _apply_sensor_from_org(ps, osen)
            session.add(ps)
            changes["sensors"]["updated"].append(aid)

    for ps in project_sensors:
        if ps.asset_id not in org_sensors:
            session.delete(ps)
            changes["sensors"]["removed"].append(ps.asset_id)

    # Profile tasks (non-custom)
    org_task_map: dict[tuple[str, str], StageTask] = {}
    task_bindings: list[tuple[StageTask, list[str], list[str]]] = []
    for t in org_tasks:
        guide_ids = [
            g for g in json.loads(t.guides_json or "[]") if g and not str(g).startswith("wf-")
        ]
        sensor_ids = list(json.loads(t.sensors_json or "[]"))
        org_task_map[(t.stage, t.task_id)] = t
        task_bindings.append((t, guide_ids, sensor_ids))

    project_tasks = list(
        session.exec(select(ProjectTask).where(ProjectTask.project_id == project.id)).all()
    )
    non_custom_by_key: dict[tuple[str, str], ProjectTask] = {}
    for pt in project_tasks:
        if pt.custom:
            continue
        non_custom_by_key[(pt.stage, pt.task_id)] = pt

    for t, guide_ids, sensor_ids in task_bindings:
        key = (t.stage, t.task_id)
        title = t.title_zh or t.title_en or t.task_id
        guides_json = json.dumps(guide_ids, ensure_ascii=False)
        sensors_json = json.dumps(sensor_ids, ensure_ascii=False)
        sort_order = getattr(t, "sort_order", 0) or 0
        pt = non_custom_by_key.get(key)
        label = f"{t.stage}/{t.task_id}"
        if not pt:
            session.add(
                ProjectTask(
                    project_id=project.id,
                    stage=t.stage,
                    task_id=t.task_id,
                    title=title,
                    required=t.required,
                    suite="",
                    guides_json=guides_json,
                    sensors_json=sensors_json,
                    custom=False,
                    sort_order=sort_order,
                )
            )
            changes["tasks"]["added"].append(label)
        else:
            guides_changed = _norm_json_list_ordered(pt.guides_json) != _norm_json_list_ordered(guides_json)
            sensors_changed = _norm_json_list_ordered(pt.sensors_json) != _norm_json_list_ordered(
                sensors_json
            )
            if (
                (pt.title or "") != title
                or bool(pt.required) != bool(t.required)
                or guides_changed
                or sensors_changed
                or (getattr(pt, "sort_order", 0) or 0) != sort_order
            ):
                pt.title = title
                pt.required = t.required
                pt.guides_json = guides_json
                pt.sensors_json = sensors_json
                pt.suite = ""
                pt.sort_order = sort_order
                session.add(pt)
                changes["tasks"]["updated"].append(label)

    for pt in list(non_custom_by_key.values()):
        if (pt.stage, pt.task_id) not in org_task_map:
            label = f"{pt.stage}/{pt.task_id}"
            session.delete(pt)
            changes["tasks"]["removed"].append(label)

    # Rebuild config_json stage order (preserve custom tasks in view via build; config mirrors org profile)
    by_stage: dict[str, list[dict[str, Any]]] = {}
    for t, guide_ids, sensor_ids in task_bindings:
        by_stage.setdefault(t.stage, []).append(
            {
                "id": t.task_id,
                "title": t.title_zh or t.title_en or t.task_id,
                "required": t.required,
                "guides": guide_ids,
                "sensors": sensor_ids,
            }
        )
    stage_ids = list(by_stage.keys())
    if profile and profile.stages_json:
        try:
            preferred = json.loads(profile.stages_json or "[]")
            stage_ids = [s for s in preferred if s in by_stage] + [
                s for s in stage_ids if s not in preferred
            ]
        except json.JSONDecodeError:
            pass

    changes["stages"]["after"] = stage_ids
    config = {
        "profile": project.profile_key,
        "org_id": org_id,
        "stages": stage_ids,
        "tasks": {s: by_stage[s] for s in stage_ids},
        "guide_ids": sorted(org_guides.keys()),
        "sensor_ids": sorted(org_sensors.keys()),
        "pulled_all_assets": True,
    }
    project.config_json = json.dumps(config, ensure_ascii=False)
    if stage_ids:
        if not project.current_stage or project.current_stage not in stage_ids:
            project.current_stage = stage_ids[0]
    session.add(project)
    session.commit()
    session.refresh(project)
    hx = build_project_hx_view(session, project)
    return {"ok": True, "changes": changes, "hx_config": hx, "config": hx}
