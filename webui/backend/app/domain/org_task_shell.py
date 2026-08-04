"""Refresh org CommandShell when StageTask bindings change."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.models import CommandShell, Guide, StageTask
from app.domain import defaults
from app.domain.guide_samples import split_guides_by_kind
from app.domain.shell_assembler import assemble_shell


def assemble_from_bindings(
    session: Session,
    org_id: str,
    stage: str,
    task_id: str,
    *,
    title: str,
    guides: list[str],
    sensors: list[str],
    body: str | None = None,
    description: str | None = None,
) -> dict[str, str]:
    """Assemble shell content from current org Guide kinds + bindings."""
    title = (title or "").strip() or task_id
    guide_ids = [g for g in guides if g and not str(g).startswith("wf-")]
    sensor_ids = [s for s in sensors if s]

    kind_map: dict[str, str] = {}
    guide_contents: dict[str, str] = {}
    if guide_ids:
        guide_rows = session.exec(
            select(Guide).where(Guide.org_id == org_id, Guide.asset_id.in_(guide_ids))  # type: ignore[attr-defined]
        ).all()
        kind_map = {g.asset_id: g.kind for g in guide_rows}
        guide_contents = {g.asset_id: g.content or "" for g in guide_rows}

    skills, templates, other_guides = split_guides_by_kind(guide_ids, kind_map)
    shell_body = body if body is not None else defaults.default_workflow_body(stage, task_id, title)
    desc = description if description is not None else f"{title} — {stage}/{task_id}"

    return assemble_shell(
        stage=stage,
        task=task_id,
        description=desc,
        body=shell_body,
        guides=skills,
        templates=templates,
        sensors=sensor_ids,
        guide_contents=guide_contents,
        other_guides=other_guides,
    )


def refresh_command_shell(
    session: Session,
    org_id: str,
    stage: str,
    task_id: str,
    *,
    title: str,
    guides: list[str],
    sensors: list[str],
    old_stage: str | None = None,
    old_task: str | None = None,
) -> CommandShell:
    """Upsert CommandShell for stage/task from current bindings.

    Existing shells keep custom body (Guide input markers refreshed) and
    description/slash_name when set; appendix is always rebuilt.
    """
    lookup_stage = old_stage if old_stage is not None else stage
    lookup_task = old_task if old_task is not None else task_id
    renamed = (lookup_stage, lookup_task) != (stage, task_id)

    def _find(s: str, t: str) -> CommandShell | None:
        return session.exec(
            select(CommandShell).where(
                CommandShell.org_id == org_id,
                CommandShell.stage == s,
                CommandShell.task == t,
            )
        ).first()

    shell = _find(stage, task_id)
    if not shell and renamed:
        # Move old shell only when no other StageTask still owns the old key.
        others = session.exec(
            select(StageTask).where(
                StageTask.org_id == org_id,
                StageTask.stage == lookup_stage,
                StageTask.task_id == lookup_task,
            )
        ).all()
        # Caller has already updated the current row to the new key, so "others"
        # are remaining rows still on the old key.
        if not others:
            shell = _find(lookup_stage, lookup_task)

    if shell:
        assembled = assemble_from_bindings(
            session,
            org_id,
            stage,
            task_id,
            title=title,
            guides=guides,
            sensors=sensors,
            body=shell.body or "",
            description=(shell.description or "").strip() or None,
        )
        shell.stage = stage
        shell.task = task_id
        shell.body = assembled["body"]
        shell.appendix = assembled["appendix"]
        if not (shell.description or "").strip():
            shell.description = assembled["description"]
        if not (shell.slash_name or "").strip():
            shell.slash_name = assembled["slash_name"]
        shell.updated_at = datetime.now(timezone.utc)
        session.add(shell)
        return shell

    assembled = assemble_from_bindings(
        session,
        org_id,
        stage,
        task_id,
        title=title,
        guides=guides,
        sensors=sensors,
    )
    row = CommandShell(
        org_id=org_id,
        stage=stage,
        task=task_id,
        slash_name=assembled["slash_name"],
        description=assembled["description"],
        body=assembled["body"],
        appendix=assembled["appendix"],
        impl="both",
    )
    session.add(row)
    return row


def delete_command_shell_if_orphan(session: Session, org_id: str, stage: str, task_id: str) -> bool:
    """Delete CommandShell when no StageTask remains for the same stage/task."""
    remaining = session.exec(
        select(StageTask).where(
            StageTask.org_id == org_id,
            StageTask.stage == stage,
            StageTask.task_id == task_id,
        )
    ).all()
    if remaining:
        return False

    shell = session.exec(
        select(CommandShell).where(
            CommandShell.org_id == org_id,
            CommandShell.stage == stage,
            CommandShell.task == task_id,
        )
    ).first()
    if not shell:
        return False
    session.delete(shell)
    return True
