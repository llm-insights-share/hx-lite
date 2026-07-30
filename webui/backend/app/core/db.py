from collections.abc import Generator
import json
import re

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from app.core.config import get_settings

settings = get_settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    echo=False,
)


def _migrate_sqlite() -> None:
    """Best-effort ALTER for columns added after first create_all."""
    if "sqlite" not in str(settings.database_url):
        return
    with engine.connect() as conn:
        # user.email
        urows = conn.execute(text('PRAGMA table_info("user")')).fetchall()
        if urows:
            unames = {r[1] for r in urows}
            if "email" not in unames:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN email VARCHAR DEFAULT \'\''))
                conn.commit()
            if "avatar_url" not in unames:
                conn.execute(text('ALTER TABLE "user" ADD COLUMN avatar_url VARCHAR DEFAULT \'\''))
                conn.commit()
            # backfill empty emails from username
            empties = conn.execute(
                text("SELECT id, username FROM \"user\" WHERE email IS NULL OR email = ''")
            ).fetchall()
            for uid, uname in empties:
                conn.execute(
                    text('UPDATE "user" SET email=:e WHERE id=:id'),
                    {"e": f"{uname}@localhost", "id": uid},
                )
            if empties:
                conn.commit()

        # ticket columns
        rows = conn.execute(text("PRAGMA table_info(ticket)")).fetchall()
        if rows:
            names = {r[1] for r in rows}
            alters = []
            if "stage" not in names:
                alters.append("ALTER TABLE ticket ADD COLUMN stage VARCHAR DEFAULT ''")
            if "task" not in names:
                alters.append("ALTER TABLE ticket ADD COLUMN task VARCHAR DEFAULT ''")
            if "artifact_name" not in names:
                alters.append("ALTER TABLE ticket ADD COLUMN artifact_name VARCHAR DEFAULT ''")
            for sql in alters:
                conn.execute(text(sql))
            if alters:
                conn.commit()

        # guide package / content_mode columns
        grow = conn.execute(text("PRAGMA table_info(guide)")).fetchall()
        if grow:
            gnames = {r[1] for r in grow}
            galters = []
            if "content_mode" not in gnames:
                galters.append("ALTER TABLE guide ADD COLUMN content_mode VARCHAR DEFAULT 'markdown'")
            if "package_path" not in gnames:
                galters.append("ALTER TABLE guide ADD COLUMN package_path VARCHAR DEFAULT ''")
            if "package_files_json" not in gnames:
                galters.append("ALTER TABLE guide ADD COLUMN package_files_json VARCHAR DEFAULT '[]'")
            for sql in galters:
                conn.execute(text(sql))
            if galters:
                conn.commit()

        # project guide status / source / version / content_mode
        pgrows = conn.execute(text("PRAGMA table_info(projectguide)")).fetchall()
        if pgrows:
            pgnames = {r[1] for r in pgrows}
            pgalters = []
            if "status" not in pgnames:
                pgalters.append("ALTER TABLE projectguide ADD COLUMN status VARCHAR DEFAULT 'draft'")
            if "source" not in pgnames:
                pgalters.append("ALTER TABLE projectguide ADD COLUMN source VARCHAR DEFAULT ''")
            if "version" not in pgnames:
                pgalters.append("ALTER TABLE projectguide ADD COLUMN version VARCHAR DEFAULT '1.0.0'")
            if "content_mode" not in pgnames:
                pgalters.append(
                    "ALTER TABLE projectguide ADD COLUMN content_mode VARCHAR DEFAULT 'markdown'"
                )
            for sql in pgalters:
                conn.execute(text(sql))
            if pgalters:
                conn.commit()
            # Backfill empty source: match org asset_id → org, else project
            try:
                org_ids = {
                    r[0]
                    for r in conn.execute(text("SELECT asset_id FROM guide WHERE org_id='default'")).fetchall()
                }
                rows = conn.execute(text("SELECT id, asset_id, source FROM projectguide")).fetchall()
                for rid, aid, src in rows:
                    if (src or "").strip():
                        continue
                    new_src = "org" if aid in org_ids else "project"
                    conn.execute(
                        text("UPDATE projectguide SET source=:s WHERE id=:id"),
                        {"s": new_src, "id": rid},
                    )
                conn.commit()
            except Exception:
                pass

        # sensor trigger channels
        for table in ("sensor", "projectsensor"):
            srows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            if not srows:
                continue
            snames = {r[1] for r in srows}
            salters = []
            if "triggers_json" not in snames:
                salters.append(
                    f"ALTER TABLE {table} ADD COLUMN triggers_json VARCHAR "
                    "DEFAULT '[\"hook:stop\",\"cli\",\"task-shell\"]'"
                )
            if "scope_json" not in snames:
                salters.append(f"ALTER TABLE {table} ADD COLUMN scope_json VARCHAR DEFAULT '[]'")
            for sql in salters:
                conn.execute(text(sql))
            if salters:
                conn.commit()

        # guide / sensor display name
        for table in ("guide", "sensor", "projectguide", "projectsensor"):
            nrows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            if not nrows:
                continue
            nnames = {r[1] for r in nrows}
            if "name" not in nnames:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN name VARCHAR DEFAULT ''"))
                conn.commit()
            conn.execute(
                text(
                    f"UPDATE {table} SET name = substr(asset_id, 1, 20) "
                    "WHERE name IS NULL OR name = ''"
                )
            )
            conn.commit()

        # command shell impl (command | skill | both)
        crows = conn.execute(text("PRAGMA table_info(commandshell)")).fetchall()
        if crows:
            cnames = {r[1] for r in crows}
            if "impl" not in cnames:
                conn.execute(text("ALTER TABLE commandshell ADD COLUMN impl VARCHAR DEFAULT 'both'"))
                conn.commit()

        # stage task sort_order
        trows = conn.execute(text("PRAGMA table_info(stagetask)")).fetchall()
        if trows:
            tnames = {r[1] for r in trows}
            if "sort_order" not in tnames:
                conn.execute(text("ALTER TABLE stagetask ADD COLUMN sort_order INTEGER DEFAULT 0"))
                conn.commit()
                # backfill per (org_id, profile_key, stage) by id order
                groups = conn.execute(
                    text(
                        "SELECT org_id, profile_key, stage FROM stagetask "
                        "GROUP BY org_id, profile_key, stage"
                    )
                ).fetchall()
                for org_id, profile_key, stage in groups:
                    rows = conn.execute(
                        text(
                            "SELECT id FROM stagetask WHERE org_id=:o AND profile_key=:p AND stage=:s "
                            "ORDER BY id"
                        ),
                        {"o": org_id, "p": profile_key, "s": stage},
                    ).fetchall()
                    for idx, (rid,) in enumerate(rows):
                        conn.execute(
                            text("UPDATE stagetask SET sort_order=:ord WHERE id=:id"),
                            {"ord": idx, "id": rid},
                        )
                conn.commit()

        # project task sort_order
        ptrows = conn.execute(text("PRAGMA table_info(projecttask)")).fetchall()
        if ptrows:
            ptnames = {r[1] for r in ptrows}
            if "sort_order" not in ptnames:
                conn.execute(text("ALTER TABLE projecttask ADD COLUMN sort_order INTEGER DEFAULT 0"))
                conn.commit()
                groups = conn.execute(
                    text("SELECT project_id, stage FROM projecttask GROUP BY project_id, stage")
                ).fetchall()
                for project_id, stage in groups:
                    rows = conn.execute(
                        text(
                            "SELECT id FROM projecttask WHERE project_id=:p AND stage=:s ORDER BY id"
                        ),
                        {"p": project_id, "s": stage},
                    ).fetchall()
                    for idx, (rid,) in enumerate(rows):
                        conn.execute(
                            text("UPDATE projecttask SET sort_order=:ord WHERE id=:id"),
                            {"ord": idx, "id": rid},
                        )
                conn.commit()

        # project creator + github token
        prows = conn.execute(text("PRAGMA table_info(project)")).fetchall()
        if prows:
            pnames = {r[1] for r in prows}
            if "created_by_user_id" not in pnames:
                conn.execute(text("ALTER TABLE project ADD COLUMN created_by_user_id INTEGER"))
                conn.commit()
            if "github_token" not in pnames:
                conn.execute(text("ALTER TABLE project ADD COLUMN github_token VARCHAR DEFAULT ''"))
                conn.commit()

        # artifact version package metadata
        avrows = conn.execute(text("PRAGMA table_info(artifactversion)")).fetchall()
        if avrows:
            avnames = {r[1] for r in avrows}
            if "content_kind" not in avnames:
                conn.execute(text("ALTER TABLE artifactversion ADD COLUMN content_kind VARCHAR DEFAULT 'file'"))
                conn.commit()
            if "files_json" not in avnames:
                conn.execute(text("ALTER TABLE artifactversion ADD COLUMN files_json VARCHAR DEFAULT '[]'"))
                conn.commit()


def _migrate_project_created_by() -> None:
    """Backfill Project.created_by_user_id from earliest project_owner member."""
    from app.core.models import Project, ProjectMember

    with Session(engine) as session:
        for project in session.exec(select(Project)).all():
            if project.created_by_user_id is not None:
                continue
            owner = session.exec(
                select(ProjectMember)
                .where(
                    ProjectMember.project_id == project.id,
                    ProjectMember.role == "project_owner",
                )
                .order_by(ProjectMember.created_at, ProjectMember.id)
            ).first()
            if owner:
                project.created_by_user_id = owner.user_id
                session.add(project)
        session.commit()


def _migrate_drop_workflow_guides() -> None:
    """Remove legacy guide.workflow / wf-* / task skill-shell rows (shells are CommandShell now)."""
    from app.core.models import Guide, ProjectGuide, ProjectTask, StageTask

    shell_id = re.compile(r"^(hx|nhx)-", re.I)

    with Session(engine) as session:
        deleted = 0
        for row in session.exec(select(Guide)).all():
            aid = row.asset_id or ""
            kind = row.kind or ""
            task = (getattr(row, "task", None) or "").strip()
            if (
                kind == "guide.workflow"
                or aid.startswith("wf-")
                or kind == "guide.command"
                or (kind == "guide.skill" and task and shell_id.match(aid))
            ):
                session.delete(row)
                deleted += 1
        for row in session.exec(select(ProjectGuide)).all():
            aid = row.asset_id or ""
            kind = row.kind or ""
            task = (row.task or "").strip()
            if (
                kind == "guide.workflow"
                or aid.startswith("wf-")
                or kind == "guide.command"
                or (kind == "guide.skill" and task and (shell_id.match(aid) or aid == task))
            ):
                session.delete(row)
                deleted += 1

        # strip wf-* / shell-like ids from task bindings
        for model in (StageTask, ProjectTask):
            for row in session.exec(select(model)).all():
                try:
                    guides = json.loads(getattr(row, "guides_json", None) or "[]")
                except json.JSONDecodeError:
                    continue
                cleaned = [
                    g
                    for g in guides
                    if g
                    and not str(g).startswith("wf-")
                    and not shell_id.match(str(g))
                ]
                if cleaned != guides:
                    row.guides_json = json.dumps(cleaned, ensure_ascii=False)
                    session.add(row)
                    deleted += 1
        if deleted:
            session.commit()


def _migrate_human_approval_sensors() -> None:
    """Promote *-approved sensors to check_type=human; backfill triggers/scope."""
    from app.core.models import ProjectSensor, Sensor
    from app.domain.defaults import default_sensor_check_type, default_sensor_payload, human_sensor_content, is_human_approval_sensor
    from app.domain.sensor_specs import DEFAULT_SENSOR_SPECS, DEFAULT_TRIGGERS_BASE, is_placeholder_sensor_content

    with Session(engine) as session:
        changed = 0
        for row in session.exec(select(Sensor)).all():
            dirty = False
            if (row.check_type or "").lower() == "manual":
                row.check_type = "human"
                row.kind = "sensor.human"
                dirty = True
            if is_human_approval_sensor(row.asset_id):
                want = default_sensor_check_type(row.asset_id)
                if row.check_type != want:
                    row.check_type = want
                    dirty = True
                if want == "human" and is_placeholder_sensor_content(row.content):
                    row.content = human_sensor_content(row.asset_id)
                    row.kind = "sensor.human"
                    dirty = True
            if row.asset_id in DEFAULT_SENSOR_SPECS and is_placeholder_sensor_content(row.content):
                payload = default_sensor_payload(row.asset_id)
                row.check_type = payload["check_type"]
                row.kind = payload["kind"]
                row.content = payload["content"]
                row.config_json = payload["config_json"]
                row.triggers_json = payload["triggers_json"]
                row.scope_json = payload["scope_json"]
                dirty = True
            elif not (row.triggers_json or "").strip() or row.triggers_json == "[]":
                if row.asset_id in DEFAULT_SENSOR_SPECS:
                    payload = default_sensor_payload(row.asset_id)
                    row.triggers_json = payload["triggers_json"]
                    row.scope_json = payload.get("scope_json") or "[]"
                else:
                    row.triggers_json = json.dumps(DEFAULT_TRIGGERS_BASE)
                    row.scope_json = row.scope_json or "[]"
                dirty = True
            if dirty:
                session.add(row)
                changed += 1
        for row in session.exec(select(ProjectSensor)).all():
            dirty = False
            if (row.check_type or "").lower() == "manual":
                row.check_type = "human"
                row.kind = "sensor.human"
                dirty = True
            if is_human_approval_sensor(row.asset_id):
                want = default_sensor_check_type(row.asset_id)
                if row.check_type != want:
                    row.check_type = want
                    dirty = True
                if want == "human" and is_placeholder_sensor_content(row.content):
                    row.content = human_sensor_content(row.asset_id)
                    row.kind = "sensor.human"
                    dirty = True
            if row.asset_id in DEFAULT_SENSOR_SPECS and is_placeholder_sensor_content(row.content):
                payload = default_sensor_payload(row.asset_id)
                row.check_type = payload["check_type"]
                row.kind = payload["kind"]
                row.content = payload["content"]
                row.triggers_json = payload["triggers_json"]
                row.scope_json = payload["scope_json"]
                dirty = True
            elif not (row.triggers_json or "").strip() or row.triggers_json == "[]":
                if row.asset_id in DEFAULT_SENSOR_SPECS:
                    payload = default_sensor_payload(row.asset_id)
                    row.triggers_json = payload["triggers_json"]
                    row.scope_json = payload.get("scope_json") or "[]"
                else:
                    row.triggers_json = json.dumps(DEFAULT_TRIGGERS_BASE)
                    row.scope_json = row.scope_json or "[]"
                dirty = True
            if dirty:
                session.add(row)
                changed += 1
        if changed:
            session.commit()


def _migrate_zh_guide_sensor_content() -> None:
    """Refresh English/placeholder Guide & Sensor bodies with Chinese Hub/spec content."""
    from app.core.models import Guide, ProjectSensor, Sensor
    from app.domain.bootstrap import _guide_kind_for_asset, load_guide_package_content
    from app.domain.defaults import default_sensor_payload
    from app.domain.sensor_specs import DEFAULT_SENSOR_SPECS, is_placeholder_sensor_content

    def _is_guide_placeholder(content: str | None) -> bool:
        c = content or ""
        return (
            "Default guide." in c
            or "Follow this guide when executing" in c
            or "（待补充）" in c
            or len(c.strip()) < 40
        )

    with Session(engine) as session:
        g_n = 0
        for g in session.exec(select(Guide)).all():
            if not _is_guide_placeholder(g.content):
                continue
            kind = g.kind or _guide_kind_for_asset(g.asset_id)
            new = load_guide_package_content(g.asset_id, kind)
            if new and new.strip() and new != (g.content or ""):
                g.content = new
                if not g.content_mode:
                    g.content_mode = "markdown"
                session.add(g)
                g_n += 1

        s_n = 0
        for model in (Sensor, ProjectSensor):
            for row in session.exec(select(model)).all():
                aid = getattr(row, "asset_id", "") or ""
                if aid not in DEFAULT_SENSOR_SPECS:
                    continue
                c = getattr(row, "content", None) or ""
                if not (is_placeholder_sensor_content(c) or "## 检查意图" not in c):
                    continue
                payload = default_sensor_payload(aid)
                row.content = payload["content"]
                row.check_type = payload["check_type"]
                row.kind = payload["kind"]
                if hasattr(row, "config_json"):
                    row.config_json = payload.get("config_json") or getattr(row, "config_json", "{}")
                if hasattr(row, "triggers_json"):
                    row.triggers_json = payload.get("triggers_json") or row.triggers_json
                if hasattr(row, "scope_json"):
                    row.scope_json = payload.get("scope_json") or row.scope_json
                session.add(row)
                s_n += 1

        if g_n or s_n:
            session.commit()


def _migrate_zh_command_shells() -> None:
    """Refresh English Command/Skill shell body+appendix to Chinese templates."""
    import json

    from app.core.models import CommandShell, StageTask
    from app.domain import defaults
    from app.domain.shell_assembler import assemble_shell

    def _is_en_shell(body: str, appendix: str) -> bool:
        blob = f"{body or ''}\n{appendix or ''}"
        return (
            "You are running the" in blob
            or "Resolve identifiers from the slash-command" in blob
            or "## Input" in blob
            or "How to use bound guides" in blob
            or "Load the PRD Context Pack" in blob
            or "Before claiming done:" in blob
        )

    with Session(engine) as session:
        n = 0
        for row in session.exec(select(CommandShell)).all():
            if not _is_en_shell(row.body or "", row.appendix or ""):
                continue
            # Prefer template (*) bindings for guides/sensors
            st = session.exec(
                select(StageTask).where(
                    StageTask.org_id == row.org_id,
                    StageTask.stage == row.stage,
                    StageTask.task_id == row.task,
                    StageTask.profile_key == "*",
                )
            ).first()
            if not st:
                st = session.exec(
                    select(StageTask).where(
                        StageTask.org_id == row.org_id,
                        StageTask.stage == row.stage,
                        StageTask.task_id == row.task,
                    )
                ).first()
            guides: list[str] = []
            sensors: list[str] = []
            if st:
                try:
                    guides = json.loads(st.guides_json or "[]")
                except json.JSONDecodeError:
                    guides = []
                try:
                    sensors = json.loads(st.sensors_json or "[]")
                except json.JSONDecodeError:
                    sensors = []
            skills = [g for g in guides if "template" not in g and not str(g).endswith("-template")]
            templates = [g for g in guides if g not in skills]
            title = (st.title_zh if st and st.title_zh else "") or row.task
            assembled = assemble_shell(
                stage=row.stage,
                task=row.task,
                description=row.description or title,
                body=defaults.default_workflow_body(row.stage, row.task, title),
                guides=skills,
                templates=templates,
                sensors=sensors,
            )
            row.body = assembled["body"]
            row.appendix = assembled["appendix"]
            if not row.description:
                row.description = title
            # Prefer Chinese description when still English-only catalog title_en leftovers
            if row.description and row.description.isascii() and title and not title.isascii():
                row.description = title
            session.add(row)
            n += 1
        if n:
            session.commit()


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate_sqlite()
    _migrate_project_created_by()
    _migrate_drop_workflow_guides()
    _migrate_human_approval_sensors()
    _migrate_zh_guide_sensor_content()
    _migrate_zh_command_shells()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
