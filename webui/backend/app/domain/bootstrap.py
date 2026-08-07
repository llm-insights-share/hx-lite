"""Bootstrap org HX configuration into SQLite."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.models import CommandShell, Guide, OrgSettings, Profile, Sensor, StageTask, Suite
from app.domain import defaults
from app.domain.shell_assembler import assemble_shell


def _clear_org(session: Session, org_id: str) -> None:
    # Suite cleared for legacy rows; no longer seeded.
    for model in (CommandShell, Guide, Sensor, Suite, StageTask, Profile):
        rows = session.exec(select(model).where(model.org_id == org_id)).all()  # type: ignore[attr-defined]
        for r in rows:
            session.delete(r)
    session.commit()


def _guide_kind_for_asset(gid: str) -> str:
    kind = "guide.template" if "template" in gid or gid.endswith("-outline") else "guide.skill"
    if gid.endswith("-template") or gid.endswith("-checklist"):
        kind = "guide.template"
    return kind


def load_guide_package_content(gid: str, kind: str | None = None) -> str:
    """Load Guide body from default Hub package; Chinese short stub if missing."""
    from app.domain.guide_samples import GUIDE_KIND_FILENAMES

    kind = kind or _guide_kind_for_asset(gid)
    kind_dir = (kind or "guide.skill").replace("guide.", "") or "skill"
    hubs = get_settings().hubs_dir / "default" / "packages" / "guide"
    candidates: list[Path] = []
    search_dirs = [
        kind_dir,
        "skill",
        "template",
        "constraint",
        "exemplar",
        "scaffold",
        "glossary",
        "capability",
    ]
    for kd in search_dirs:
        base = hubs / kd / gid / "1.0.0"
        raw_names = GUIDE_KIND_FILENAMES.get(kd, ["SKILL.md", "template.md", f"{gid}.md"])
        for name in raw_names:
            candidates.append(base / name.replace("{gid}", gid))
        if base.is_dir():
            candidates.extend(sorted(base.glob("*.md")))
    seen: set[str] = set()
    for p in candidates:
        key = str(p)
        if key in seen:
            continue
        seen.add(key)
        if p.is_file():
            text = p.read_text(encoding="utf-8").strip()
            if text:
                return text + ("\n" if not text.endswith("\n") else "")
    return f"# {gid}\n\n（待补充）请在组织 Guide 资产中完善本条目的中文正文。\n"

def bootstrap_org(session: Session, org_id: str = "default", org_name: str = "Default Org") -> dict:
    from app.domain.org_seed import ensure_demo_projects, import_org_seed, seed_available

    if seed_available():
        result = import_org_seed(session, org_id=org_id, clear_org=True, include_projects=True)
        # Apply requested org_name on top of seed settings
        settings = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
        if settings and org_name:
            settings.org_name = org_name
            settings.updated_at = datetime.now(timezone.utc)
            session.add(settings)
            session.commit()
        result["bootstrap"] = "seed"
        return result

    _clear_org(session, org_id)

    settings = session.exec(select(OrgSettings).where(OrgSettings.org_id == org_id)).first()
    if not settings:
        settings = OrgSettings(org_id=org_id, org_name=org_name)
    else:
        settings.org_name = org_name
        settings.updated_at = datetime.now(timezone.utc)
    session.add(settings)

    # full task catalog as template (*)
    guide_ids: set[str] = set()
    sensor_ids: set[str] = set()
    for stage, tasks in defaults.STAGE_TASKS.items():
        for idx, t in enumerate(tasks):
            sensors = list(t.get("sensors") or [])
            session.add(
                StageTask(
                    org_id=org_id,
                    profile_key="*",
                    stage=stage,
                    task_id=t["id"],
                    title_zh=t["title_zh"],
                    title_en=t["title_en"],
                    required=t["required"],
                    suite="",
                    guides_json=json.dumps(t["guides"]),
                    sensors_json=json.dumps(sensors),
                    enabled=True,
                    sort_order=idx,
                )
            )
            guide_ids.update(t["guides"])
            sensor_ids.update(sensors)

    # profiles + profile-scoped tasks
    for key, pdef in defaults.PROFILE_DEFS.items():
        session.add(
            Profile(
                org_id=org_id,
                key=key,
                title=pdef["title"],
                description=pdef["description"],
                stages_json=json.dumps(pdef["stages"]),
            )
        )
        for stage, task_ids in pdef["tasks"].items():
            for idx, tid in enumerate(task_ids):
                base = defaults.task_def(stage, tid)
                if not base:
                    continue
                sensors = defaults.resolve_task_sensors(stage, tid, key)
                sensor_ids.update(sensors)
                session.add(
                    StageTask(
                        org_id=org_id,
                        profile_key=key,
                        stage=stage,
                        task_id=tid,
                        title_zh=base["title_zh"],
                        title_en=base["title_en"],
                        required=True,
                        suite="",
                        guides_json=json.dumps(base["guides"]),
                        sensors_json=json.dumps(sensors),
                        enabled=True,
                        sort_order=idx,
                    )
                )
                guide_ids.update(base["guides"])

    # guides
    guide_content_map: dict[str, str] = {}
    for gid in sorted(guide_ids):
        kind = _guide_kind_for_asset(gid)
        content = load_guide_package_content(gid, kind)
        guide_content_map[gid] = content
        session.add(
            Guide(
                org_id=org_id,
                asset_id=gid,
                name=(gid or "")[:20],
                kind=kind,
                version="1.0.0",
                status="enforced",
                content=content,
                content_mode="markdown",
            )
        )

    # sensors (no guide.workflow / wf-* — task shells live in CommandShell)
    for sid in sorted(sensor_ids):
        payload = defaults.default_sensor_payload(sid)
        session.add(
            Sensor(
                org_id=org_id,
                asset_id=sid,
                name=(sid or "")[:20],
                kind=payload["kind"],
                version="1.0.0",
                status="enforced",
                check_type=payload["check_type"],
                content=payload["content"],
                config_json=payload["config_json"],
                triggers_json=payload.get("triggers_json") or '["hook:stop","cli","task-shell"]',
                scope_json=payload.get("scope_json") or "[]",
            )
        )

    session.commit()

    # command shells for all catalog tasks
    from app.domain.guide_samples import split_guides_by_kind

    shells = 0
    for stage, tasks in defaults.STAGE_TASKS.items():
        for t in tasks:
            kind_map = {gid: _guide_kind_for_asset(gid) for gid in t["guides"]}
            skills, templates, other_guides = split_guides_by_kind(t["guides"], kind_map)
            assembled = assemble_shell(
                stage=stage,
                task=t["id"],
                description=t["title_zh"] or t["title_en"],
                body=defaults.default_workflow_body(stage, t["id"], t["title_zh"]),
                guides=skills,
                templates=templates,
                sensors=list(t.get("sensors") or []),
                guide_contents=guide_content_map,
                other_guides=other_guides,
            )
            session.add(
                CommandShell(
                    org_id=org_id,
                    stage=stage,
                    task=t["id"],
                    slash_name=assembled["slash_name"],
                    description=assembled["description"],
                    body=assembled["body"],
                    appendix=assembled["appendix"],
                )
            )
            shells += 1
    session.commit()

    demo = ensure_demo_projects(session, org_id=org_id)
    return {
        "org_id": org_id,
        "bootstrap": "defaults",
        "profiles": len(defaults.PROFILE_DEFS),
        "tasks_catalog": sum(len(v) for v in defaults.STAGE_TASKS.values()),
        "guides": len(guide_ids),
        "sensors": len(sensor_ids),
        "commands": shells,
        "demo_projects": demo,
    }
