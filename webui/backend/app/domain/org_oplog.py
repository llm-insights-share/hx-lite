"""Organization operation log helpers."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlmodel import Session

from app.core.models import OrgOperationLog, User


def write_org_log(
    session: Session,
    user: Optional[User],
    action: str,
    summary: str,
    detail: Any = None,
    *,
    org_id: str = "default",
    commit: bool = True,
) -> OrgOperationLog:
    row = OrgOperationLog(
        org_id=org_id or "default",
        actor_user_id=(user.id if user else None),
        actor_username=(user.username if user else "") or "",
        action=action,
        summary=summary or "",
        detail_json=json.dumps(detail if detail is not None else {}, ensure_ascii=False, default=str),
    )
    session.add(row)
    if commit:
        session.commit()
        session.refresh(row)
    return row
