"""Project operation log helpers."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlmodel import Session

from app.core.models import ProjectOperationLog, User


def write_project_log(
    session: Session,
    project_id: int,
    user: Optional[User],
    action: str,
    summary: str,
    detail: Any = None,
    *,
    commit: bool = True,
) -> ProjectOperationLog:
    row = ProjectOperationLog(
        project_id=project_id,
        actor_user_id=(user.id if user else None),
        actor_username=(user.username if user else "") or "",
        action=action,
        summary=summary or "",
        detail_json=json.dumps(detail if detail is not None else {}, ensure_ascii=False),
    )
    session.add(row)
    if commit:
        session.commit()
        session.refresh(row)
    return row


def summarize_sync_changes(changes: dict[str, Any] | None) -> str:
    if not changes:
        return "无变更"
    parts: list[str] = []
    for key, label in (("guides", "Guide"), ("sensors", "Check"), ("tasks", "Task")):
        bucket = changes.get(key) or {}
        a = len(bucket.get("added") or [])
        u = len(bucket.get("updated") or [])
        r = len(bucket.get("removed") or [])
        if a or u or r:
            parts.append(f"{label} +{a}/~{u}/-{r}")
    stages = changes.get("stages") or {}
    before = stages.get("before") or []
    after = stages.get("after") or []
    if before != after:
        parts.append("Stage 顺序变更")
    return " · ".join(parts) if parts else "无变更"


def sync_change_count(changes: dict[str, Any] | None) -> int:
    if not changes:
        return 0
    n = 0
    for key in ("guides", "sensors", "tasks"):
        bucket = changes.get(key) or {}
        n += len(bucket.get("added") or [])
        n += len(bucket.get("updated") or [])
        n += len(bucket.get("removed") or [])
    stages = changes.get("stages") or {}
    if (stages.get("before") or []) != (stages.get("after") or []):
        n += 1
    return n
