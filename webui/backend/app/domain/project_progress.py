"""Project progress: artifact evidence, human approval when bound, else shell-run fallback."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from app.core.models import (
    Artifact,
    Project,
    ProjectSensor,
    ProjectTask,
    TaskShellRunLog,
    Ticket,
)


def _parse_json_list(raw: str | None) -> list[str]:
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        data = []
    if not isinstance(data, list):
        return []
    return [str(x).strip() for x in data if str(x).strip()]


def _stage_order(project: Project) -> list[str]:
    try:
        cfg = json.loads(project.config_json or "{}")
    except json.JSONDecodeError:
        cfg = {}
    stages = cfg.get("stages") or []
    return [str(s).strip() for s in stages if str(s).strip()]


def _is_human_sensor(sensor: ProjectSensor) -> bool:
    ct = (sensor.check_type or "").strip().lower()
    if ct in ("human", "manual"):
        return True
    return (sensor.kind or "").strip().lower() == "sensor.human"


def _dt_key(value: datetime | None) -> str:
    if value is None:
        return ""
    return str(value)


def task_is_complete(
    *,
    task: ProjectTask,
    human_sensor_ids: set[str],
    artifact_keys: set[tuple[str, str]],
    approved_human_keys: set[tuple[str, str]],
    shell_keys: set[tuple[str, str]] | None = None,
) -> bool:
    """Completion rule:

    - Human-bound task: need artifact + approved human-check.
    - Otherwise: artifact OR at least one task-shell run.
    """
    stage = (task.stage or "").strip()
    task_id = (task.task_id or "").strip()
    if not stage or not task_id:
        return False
    bound = _parse_json_list(task.sensors_json)
    needs_human = any(sid in human_sensor_ids for sid in bound)
    has_art = (stage, task_id) in artifact_keys
    has_shell = (stage, task_id) in (shell_keys or set())
    if needs_human:
        if not has_art:
            return False
        if (stage, task_id) not in approved_human_keys:
            return False
        return True
    return has_art or has_shell


def build_project_progress(session: Session, project: Project) -> dict[str, Any]:
    """Compute completed stages/tasks and current cursor for list/detail display."""
    if project.id is None:
        return {
            "completed_stages": [],
            "completed_tasks": [],
            "current_stage": project.current_stage or "",
            "current_task": getattr(project, "current_task", None) or "",
            "current_task_title": "",
        }

    tasks = list(
        session.exec(select(ProjectTask).where(ProjectTask.project_id == project.id)).all()
    )
    tasks_sorted = sorted(
        tasks,
        key=lambda t: (
            t.stage or "",
            getattr(t, "sort_order", 0) or 0,
            t.id or 0,
        ),
    )

    sensors = list(
        session.exec(select(ProjectSensor).where(ProjectSensor.project_id == project.id)).all()
    )
    human_sensor_ids = {s.asset_id for s in sensors if s.asset_id and _is_human_sensor(s)}

    arts = list(session.exec(select(Artifact).where(Artifact.project_id == project.id)).all())
    artifact_keys: set[tuple[str, str]] = set()
    artifact_at: dict[tuple[str, str], str] = {}
    for a in arts:
        st = (a.stage or "").strip()
        tk = (a.task or "").strip()
        if st and tk:
            key = (st, tk)
            artifact_keys.add(key)
            ts = _dt_key(getattr(a, "updated_at", None))
            if ts >= artifact_at.get(key, ""):
                artifact_at[key] = ts

    tickets = list(
        session.exec(
            select(Ticket).where(
                Ticket.project_id == project.id,
                Ticket.ticket_type == "human-check",
                Ticket.status == "approved",
            )
        ).all()
    )
    approved_human_keys: set[tuple[str, str]] = set()
    ticket_at: dict[tuple[str, str], str] = {}
    for t in tickets:
        st = (t.stage or "").strip()
        tk = (t.task or "").strip()
        if st and tk:
            key = (st, tk)
            approved_human_keys.add(key)
            ts = _dt_key(getattr(t, "updated_at", None) or getattr(t, "created_at", None))
            if ts >= ticket_at.get(key, ""):
                ticket_at[key] = ts

    shell_rows = list(
        session.exec(select(TaskShellRunLog).where(TaskShellRunLog.project_id == project.id)).all()
    )
    shell_keys: set[tuple[str, str]] = set()
    shell_at: dict[tuple[str, str], str] = {}
    for r in shell_rows:
        st = (r.stage or "").strip()
        tk = (r.task_id or "").strip()
        if not st or not tk:
            continue
        key = (st, tk)
        shell_keys.add(key)
        ts = _dt_key(getattr(r, "run_at", None))
        if ts >= shell_at.get(key, ""):
            shell_at[key] = ts

    completed_raw: list[dict[str, Any]] = []
    by_stage: dict[str, list[ProjectTask]] = {}
    for t in tasks_sorted:
        by_stage.setdefault(t.stage or "", []).append(t)
        stage = (t.stage or "").strip()
        task_id = (t.task_id or "").strip()
        ok = task_is_complete(
            task=t,
            human_sensor_ids=human_sensor_ids,
            artifact_keys=artifact_keys,
            approved_human_keys=approved_human_keys,
            shell_keys=shell_keys,
        )
        if ok:
            key = (stage, task_id)
            completed_at = max(
                artifact_at.get(key, ""),
                shell_at.get(key, ""),
                ticket_at.get(key, ""),
                "",
            )
            completed_raw.append(
                {
                    "stage": t.stage or "",
                    "task_id": t.task_id or "",
                    "title": t.title or t.task_id or "",
                    "completed_at": completed_at,
                }
            )

    # Newest completion first
    completed_raw.sort(key=lambda x: x.get("completed_at") or "", reverse=True)
    completed_tasks = [
        {"stage": x["stage"], "task_id": x["task_id"], "title": x["title"]} for x in completed_raw
    ]

    stage_ids = _stage_order(project)
    if not stage_ids:
        seen: list[str] = []
        for t in tasks_sorted:
            st = t.stage or ""
            if st and st not in seen:
                seen.append(st)
        stage_ids = seen

    current_stage = (project.current_stage or "").strip()
    current_task = (getattr(project, "current_task", None) or "").strip()

    # Fully evidenced stages
    evidenced_complete: set[str] = set()
    for st in stage_ids:
        stage_tasks = by_stage.get(st) or []
        if not stage_tasks:
            continue
        if all(
            task_is_complete(
                task=t,
                human_sensor_ids=human_sensor_ids,
                artifact_keys=artifact_keys,
                approved_human_keys=approved_human_keys,
                shell_keys=shell_keys,
            )
            for t in stage_tasks
        ):
            evidenced_complete.add(st)

    # Stages before current_stage are considered passed (even if a task was skipped)
    passed_before_current: set[str] = set()
    if current_stage in stage_ids:
        idx = stage_ids.index(current_stage)
        passed_before_current = set(stage_ids[:idx])

    completed_stages = [st for st in stage_ids if st in evidenced_complete or st in passed_before_current]

    current_task_title = ""
    if current_stage and current_task:
        for t in tasks_sorted:
            if (t.stage or "") == current_stage and (t.task_id or "") == current_task:
                current_task_title = t.title or t.task_id or ""
                break

    return {
        "completed_stages": completed_stages,
        "completed_tasks": completed_tasks,
        "current_stage": current_stage,
        "current_task": current_task,
        "current_task_title": current_task_title,
    }
