"""Refresh org CommandShell when StageTask bindings change."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.core.models import CommandShell, Guide, OrgSettings, StageTask
from app.domain import defaults
from app.domain.guide_samples import split_guides_by_kind
from app.domain.path_layout import parse_path_layout
from app.domain.shell_assembler import assemble_shell


def load_org_path_layout(session: Session, org_id: str) -> dict:
    row = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
    raw = getattr(row, "path_layout_json", None) if row else None
    return parse_path_layout(raw)


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
    template_primary_files: dict[str, str] = {}
    if guide_ids:
        guide_rows = session.exec(
            select(Guide).where(Guide.org_id == org_id, Guide.asset_id.in_(guide_ids))  # type: ignore[attr-defined]
        ).all()
        kind_map = {g.asset_id: g.kind for g in guide_rows}
        guide_contents = {g.asset_id: g.content or "" for g in guide_rows}
        from app.domain.guide_package import pick_primary_package_filename

        for g in guide_rows:
            try:
                files = json.loads(getattr(g, "package_files_json", None) or "[]")
            except json.JSONDecodeError:
                files = []
            if not isinstance(files, list):
                files = []
            primary = pick_primary_package_filename(
                [str(x) for x in files], g.kind or ""
            )
            if primary:
                template_primary_files[g.asset_id] = primary

    skills, templates, other_guides = split_guides_by_kind(guide_ids, kind_map)
    shell_body = body if body is not None else defaults.default_workflow_body(stage, task_id, title)
    desc = description if description is not None else f"{title} — {stage}/{task_id}"
    path_layout = load_org_path_layout(session, org_id)

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
        path_layout=path_layout,
        template_primary_files={
            tid: template_primary_files[tid]
            for tid in templates
            if tid in template_primary_files
        },
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


def refresh_shells_binding_guide(session: Session, org_id: str, asset_id: str) -> int:
    """Rebuild CommandShell appendix for every StageTask that binds ``asset_id``."""
    aid = (asset_id or "").strip()
    if not aid:
        return 0
    tasks = session.exec(select(StageTask).where(StageTask.org_id == org_id)).all()
    count = 0
    for t in tasks:
        try:
            guides = json.loads(t.guides_json or "[]")
        except json.JSONDecodeError:
            guides = []
        if not isinstance(guides, list) or aid not in guides:
            continue
        try:
            sensors = json.loads(t.sensors_json or "[]")
        except json.JSONDecodeError:
            sensors = []
        refresh_command_shell(
            session,
            org_id,
            t.stage or "",
            t.task_id or "",
            title=(t.title_zh or t.title_en or t.task_id or ""),
            guides=[str(g) for g in guides if g],
            sensors=[str(s) for s in sensors if s],
        )
        count += 1
    return count
