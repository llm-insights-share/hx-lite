"""Helpers for project custom tasks: shell assembly without Guide skill shells."""

from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session, select

from app.core.models import Project, ProjectGuide, ProjectTask
from app.domain import defaults
from app.domain.shell_assembler import assemble_shell


def _split_guides(
    guide_ids: list[str], session: Session, project_id: int
) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    """Split into skills / templates / other guides using project guide kinds."""
    from app.domain.guide_samples import split_guides_by_kind

    rows = session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project_id)).all()
    kind_map = {g.asset_id: g.kind for g in rows}
    return split_guides_by_kind(guide_ids, kind_map)


def ensure_task_shells(
    session: Session,
    project_id: int,
    stage: str,
    task_id: str,
    title: str,
    guides: list[str],
    sensors: list[str],
) -> dict[str, Any]:
    """Assemble task shell metadata without creating ProjectGuide skill shells.

    Task shells belong in CommandShell / skill-shells. Guides list only keeps
    real work skills/templates the caller already bound.
    """
    title = title or task_id

    existing = {
        g.asset_id: g
        for g in session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project_id)).all()
    }

    # Drop legacy wf-* and do not auto-inject task_id as a Guide skill shell
    bound = [g for g in guides if g and not str(g).startswith("wf-") and g != f"wf-{task_id}"]

    skills, templates, other_guides = _split_guides(bound, session, project_id)

    body = defaults.default_workflow_body(stage, task_id, title)
    guide_rows = session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project_id)).all()
    guide_content_map = {g.asset_id: g.content or "" for g in guide_rows}
    from app.domain.guide_package import pick_primary_package_filename
    import json as _json

    template_primary_files: dict[str, str] = {}
    for g in guide_rows:
        try:
            files = _json.loads(getattr(g, "package_files_json", None) or "[]")
        except _json.JSONDecodeError:
            files = []
        if not isinstance(files, list):
            files = []
        primary = pick_primary_package_filename([str(x) for x in files], g.kind or "")
        if primary and g.asset_id in templates:
            template_primary_files[g.asset_id] = primary

    assembled = assemble_shell(
        stage=stage,
        task=task_id,
        description=title,
        body=body,
        guides=skills,
        templates=templates,
        sensors=sensors,
        guide_contents=guide_content_map,
        other_guides=other_guides,
        template_primary_files=template_primary_files,
    )

    # Remove leftover guide.workflow / auto skill-shell ProjectGuide for this task
    wf_id = f"wf-{task_id}"
    if wf_id in existing:
        session.delete(existing[wf_id])

    auto_shell = existing.get(task_id)
    if (
        auto_shell
        and (auto_shell.kind or "") == "guide.skill"
        and (auto_shell.task or "") == task_id
    ):
        session.delete(auto_shell)

    return {
        "skill_id": None,
        "slash_name": assembled["slash_name"],
        "shell_body": assembled["body"],
        "shell_appendix": assembled["appendix"],
        "guides": bound,
        "created": [],
        "updated": [],
    }


def delete_task_shells(session: Session, project_id: int, task_id: str, *, custom_only_skill: bool = True) -> None:
    """Remove legacy workflow shell; skill removed only when custom-only."""
    wf = session.exec(
        select(ProjectGuide).where(
            ProjectGuide.project_id == project_id,
            ProjectGuide.asset_id == f"wf-{task_id}",
        )
    ).first()
    if wf:
        session.delete(wf)

    # also delete any leftover guide.workflow for this task
    for g in session.exec(
        select(ProjectGuide).where(
            ProjectGuide.project_id == project_id,
            ProjectGuide.task == task_id,
            ProjectGuide.kind == "guide.workflow",
        )
    ).all():
        session.delete(g)

    if custom_only_skill:
        skill = session.exec(
            select(ProjectGuide).where(
                ProjectGuide.project_id == project_id,
                ProjectGuide.asset_id == task_id,
                ProjectGuide.kind == "guide.skill",
                ProjectGuide.task == task_id,
            )
        ).first()
        if skill:
            session.delete(skill)


def list_project_stage_options(session: Session, project: Project) -> list[str]:
    """Stages available for custom tasks: profile stages ∪ project tasks ∪ defaults."""
    stages: list[str] = []
    try:
        cfg = json.loads(project.config_json or "{}")
        for s in cfg.get("stages") or []:
            if s and s not in stages:
                stages.append(s)
    except json.JSONDecodeError:
        pass
    for t in session.exec(select(ProjectTask).where(ProjectTask.project_id == project.id)).all():
        if t.stage and t.stage not in stages:
            stages.append(t.stage)
    for s in defaults.STAGES:
        if s not in stages:
            stages.append(s)
    return stages
