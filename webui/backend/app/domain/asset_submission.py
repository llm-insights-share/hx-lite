"""Project → org Guide/Sensor promotion (asset submission)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.models import (
    AssetSubmission,
    AssetSubmissionItem,
    Guide,
    Project,
    ProjectGuide,
    ProjectSensor,
    Sensor,
)

VALID_TARGET = frozenset({"trial", "enforced"})


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def next_submission_no(session: Session) -> str:
    n = len(session.exec(select(AssetSubmission)).all()) + 1
    return f"AS-{n:05d}"


def org_guide_ids(session: Session, org_id: str) -> set[str]:
    return {
        r.asset_id
        for r in session.exec(select(Guide).where(Guide.org_id == org_id)).all()
        if r.asset_id
    }


def org_sensor_ids(session: Session, org_id: str) -> set[str]:
    return {
        r.asset_id
        for r in session.exec(select(Sensor).where(Sensor.org_id == org_id)).all()
        if r.asset_id
    }


def list_promotable(session: Session, project: Project, org_id: str = "default") -> dict[str, list[dict[str, Any]]]:
    g_ids = org_guide_ids(session, org_id)
    s_ids = org_sensor_ids(session, org_id)
    guides = []
    for r in session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project.id)).all():
        if r.asset_id and r.asset_id not in g_ids:
            guides.append(
                {
                    "asset_kind": "guide",
                    "id": r.id,
                    "asset_id": r.asset_id,
                    "kind": r.kind,
                    "content_preview": (r.content or "")[:200],
                }
            )
    sensors = []
    for r in session.exec(select(ProjectSensor).where(ProjectSensor.project_id == project.id)).all():
        if r.asset_id and r.asset_id not in s_ids:
            sensors.append(
                {
                    "asset_kind": "sensor",
                    "id": r.id,
                    "asset_id": r.asset_id,
                    "kind": r.kind,
                    "check_type": r.check_type,
                    "content_preview": (r.content or "")[:200],
                }
            )
    return {"guides": guides, "sensors": sensors}


def create_submission(
    session: Session,
    project: Project,
    reason: str,
    items: list[dict[str, str]],
    submitter: str,
    org_id: str = "default",
) -> AssetSubmission:
    reason = (reason or "").strip()
    if not reason:
        raise HTTPException(400, "请填写提交理由")
    if not items:
        raise HTTPException(400, "请选择至少一个资产")

    g_ids = org_guide_ids(session, org_id)
    s_ids = org_sensor_ids(session, org_id)
    proj_guides = {
        r.asset_id: r
        for r in session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project.id)).all()
    }
    proj_sensors = {
        r.asset_id: r
        for r in session.exec(select(ProjectSensor).where(ProjectSensor.project_id == project.id)).all()
    }

    sub = AssetSubmission(
        submission_no=next_submission_no(session),
        project_id=project.id or 0,
        org_id=org_id,
        reason=reason,
        status="submitted",
        submitter=submitter,
    )
    session.add(sub)
    session.flush()

    seen: set[tuple[str, str]] = set()
    for raw in items:
        kind = (raw.get("asset_kind") or "").strip()
        aid = (raw.get("asset_id") or "").strip()
        if not kind or not aid:
            continue
        key = (kind, aid)
        if key in seen:
            continue
        seen.add(key)
        if kind == "guide":
            if aid in g_ids:
                raise HTTPException(400, f"Guide「{aid}」已在组织库，不可提交")
            src = proj_guides.get(aid)
            if not src:
                raise HTTPException(404, f"项目中不存在 Guide「{aid}」")
            session.add(
                AssetSubmissionItem(
                    submission_id=sub.id or 0,
                    asset_kind="guide",
                    asset_id=aid,
                    source_project_row_id=src.id or 0,
                    kind=src.kind or "guide.skill",
                    content=src.content or "",
                    version="1.0.0",
                    item_status="pending",
                )
            )
        elif kind == "sensor":
            if aid in s_ids:
                raise HTTPException(400, f"Check「{aid}」已在组织库，不可提交")
            src = proj_sensors.get(aid)
            if not src:
                raise HTTPException(404, f"项目中不存在 Check「{aid}」")
            session.add(
                AssetSubmissionItem(
                    submission_id=sub.id or 0,
                    asset_kind="sensor",
                    asset_id=aid,
                    source_project_row_id=src.id or 0,
                    kind=src.kind or "sensor.rule",
                    content=src.content or "",
                    check_type=src.check_type or "rules",
                    triggers_json=getattr(src, "triggers_json", None) or "[]",
                    scope_json=getattr(src, "scope_json", None) or "[]",
                    version="1.0.0",
                    item_status="pending",
                )
            )
        else:
            raise HTTPException(400, f"未知资产类型：{kind}")

    if not seen:
        raise HTTPException(400, "请选择至少一个有效资产")

    session.commit()
    session.refresh(sub)
    return sub


def submission_payload(session: Session, sub: AssetSubmission) -> dict[str, Any]:
    project = session.get(Project, sub.project_id)
    items = session.exec(
        select(AssetSubmissionItem).where(AssetSubmissionItem.submission_id == sub.id)
    ).all()
    return {
        "id": sub.id,
        "submission_no": sub.submission_no,
        "project_id": sub.project_id,
        "project_name": project.name if project else "",
        "org_id": sub.org_id,
        "reason": sub.reason,
        "status": sub.status,
        "submitter": sub.submitter,
        "decided_by": sub.decided_by,
        "decision_note": sub.decision_note,
        "created_at": sub.created_at,
        "decided_at": sub.decided_at,
        "items": [
            {
                "id": it.id,
                "asset_kind": it.asset_kind,
                "asset_id": it.asset_id,
                "kind": it.kind,
                "content": it.content,
                "check_type": it.check_type,
                "triggers_json": it.triggers_json,
                "scope_json": it.scope_json,
                "version": it.version,
                "item_status": it.item_status,
                "target_status": it.target_status,
            }
            for it in items
        ],
    }


def decide_submission(
    session: Session,
    sub: AssetSubmission,
    *,
    decision: str,
    note: str,
    item_decisions: list[dict[str, Any]],
    decided_by: str,
) -> dict[str, Any]:
    if sub.status != "submitted":
        raise HTTPException(400, f"申请状态为 {sub.status}，不可再审批")

    items = {
        it.id: it
        for it in session.exec(
            select(AssetSubmissionItem).where(AssetSubmissionItem.submission_id == sub.id)
        ).all()
    }
    if decision == "reject":
        for it in items.values():
            it.item_status = "skipped"
            session.add(it)
        sub.status = "rejected"
        sub.decision_note = note or ""
        sub.decided_by = decided_by
        sub.decided_at = _utcnow()
        session.add(sub)
        session.commit()
        session.refresh(sub)
        return submission_payload(session, sub)

    if decision != "approve":
        raise HTTPException(400, "decision 须为 approve 或 reject")

    by_id = {d.get("id"): d for d in item_decisions if d.get("id") is not None}
    accepted = 0
    skipped = 0
    for iid, it in items.items():
        d = by_id.get(iid) or {}
        action = (d.get("action") or "skip").strip()
        if action == "accept":
            target = (d.get("target_status") or "trial").strip()
            if target not in VALID_TARGET:
                raise HTTPException(400, f"target_status 须为 trial 或 enforced，收到：{target}")
            # re-check org collision
            if it.asset_kind == "guide":
                exists = session.exec(
                    select(Guide).where(Guide.org_id == sub.org_id, Guide.asset_id == it.asset_id)
                ).first()
                if exists:
                    raise HTTPException(400, f"组织库已存在 Guide「{it.asset_id}」，无法入库")
                session.add(
                    Guide(
                        org_id=sub.org_id,
                        asset_id=it.asset_id,
                        kind=it.kind or "guide.skill",
                        version=it.version or "1.0.0",
                        status=target,
                        content=it.content or "",
                        content_mode="markdown",
                    )
                )
            else:
                exists = session.exec(
                    select(Sensor).where(Sensor.org_id == sub.org_id, Sensor.asset_id == it.asset_id)
                ).first()
                if exists:
                    raise HTTPException(400, f"组织库已存在 Check「{it.asset_id}」，无法入库")
                session.add(
                    Sensor(
                        org_id=sub.org_id,
                        asset_id=it.asset_id,
                        kind=it.kind or "sensor.rule",
                        version=it.version or "1.0.0",
                        status=target,
                        check_type=it.check_type or "rules",
                        content=it.content or "",
                        triggers_json=it.triggers_json or "[]",
                        scope_json=it.scope_json or "[]",
                        config_json="{}",
                    )
                )
            it.item_status = "accepted"
            it.target_status = target
            accepted += 1
        else:
            it.item_status = "skipped"
            skipped += 1
        session.add(it)

    if accepted == 0:
        sub.status = "rejected"
    elif skipped == 0:
        sub.status = "approved"
    else:
        sub.status = "partial"
    sub.decision_note = note or ""
    sub.decided_by = decided_by
    sub.decided_at = _utcnow()
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return submission_payload(session, sub)


def set_asset_status(
    session: Session,
    *,
    asset_type: str,
    row_id: int,
    status: str,
) -> dict[str, Any]:
    status = (status or "").strip()
    allowed = {"trial", "enforced"}
    if status not in allowed:
        raise HTTPException(400, "status 须为 trial 或 enforced")

    def _transition(current: str, target: str) -> bool:
        cur = (current or "draft").strip() or "draft"
        if cur == "draft" and target in ("trial", "enforced"):
            return True
        if cur == "trial" and target == "enforced":
            return True
        return False

    if asset_type == "guide":
        row = session.get(Guide, row_id)
        if not row:
            raise HTTPException(404)
        if not _transition(row.status, status):
            raise HTTPException(
                400,
                f"不支持 {row.status or 'draft'}→{status}（允许 draft→trial/enforced、trial→enforced）",
            )
        row.status = status
        row.updated_at = _utcnow()
        session.add(row)
        session.commit()
        session.refresh(row)
        return {"id": row.id, "asset_id": row.asset_id, "status": row.status}
    if asset_type == "sensor":
        row = session.get(Sensor, row_id)
        if not row:
            raise HTTPException(404)
        if not _transition(row.status, status):
            raise HTTPException(
                400,
                f"不支持 {row.status or 'draft'}→{status}（允许 draft→trial/enforced、trial→enforced）",
            )
        row.status = status
        session.add(row)
        session.commit()
        session.refresh(row)
        return {"id": row.id, "asset_id": row.asset_id, "status": row.status}
    raise HTTPException(400, "asset_type 须为 guide 或 sensor")
