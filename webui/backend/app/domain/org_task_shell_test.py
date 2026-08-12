import unittest

from sqlmodel import Session, SQLModel, create_engine, select

from app.core.models import CommandShell, Guide, StageTask
from app.domain.org_task_shell import delete_command_shell_if_orphan, refresh_command_shell


class OrgTaskShellTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        SQLModel.metadata.create_all(self.engine)

    def _add_guides(self, session: Session) -> None:
        session.add(
            Guide(
                org_id="default",
                asset_id="prd-writing",
                name="PRD",
                kind="guide.skill",
                content="## 输入\n- `<slug>`：需求标识。\n",
            )
        )
        session.add(
            Guide(
                org_id="default",
                asset_id="proposal-template",
                name="Proposal",
                kind="guide.template",
                content="## 模板\n- outline\n",
            )
        )
        session.add(
            Guide(
                org_id="default",
                asset_id="design-template",
                name="Design",
                kind="guide.template",
                content="## 模板\n- design\n",
            )
        )
        session.commit()

    def test_creates_shell_when_missing(self) -> None:
        with Session(self.engine) as session:
            self._add_guides(session)
            shell = refresh_command_shell(
                session,
                "default",
                "req",
                "prd-writing",
                title="PRD 编写",
                guides=["prd-writing", "proposal-template", "design-template"],
                sensors=["prd-approved"],
            )
            session.commit()
            self.assertIsNotNone(shell.id)
            self.assertIn("`prd-writing`", shell.appendix)
            self.assertIn("Templates（2", shell.appendix)
            self.assertIn("`prd-approved`", shell.appendix)
            self.assertIn("nhx submit", shell.appendix)
            self.assertIn("approve request", shell.appendix)
            self.assertIn("proposal-template", shell.appendix)
            self.assertIn("docs/requirements", shell.appendix)

    def test_preserves_custom_body_and_refreshes_appendix(self) -> None:
        with Session(self.engine) as session:
            self._add_guides(session)
            session.add(
                CommandShell(
                    org_id="default",
                    stage="req",
                    task="prd-writing",
                    slash_name="hx-req-prd-writing",
                    description="custom desc",
                    body="## 自定义步骤\n- keep me\n",
                    appendix="stale Templates（2）内容",
                )
            )
            session.commit()

            shell = refresh_command_shell(
                session,
                "default",
                "req",
                "prd-writing",
                title="PRD 编写",
                guides=["prd-writing"],
                sensors=[],
            )
            session.commit()

            self.assertIn("## 自定义步骤", shell.body)
            self.assertIn("keep me", shell.body)
            self.assertEqual(shell.description, "custom desc")
            self.assertNotIn("Templates（2）", shell.appendix)
            self.assertIn("**Skill：**", shell.appendix)
            self.assertIn("`prd-writing`", shell.appendix)

    def test_removing_templates_drops_multi_template_hint(self) -> None:
        with Session(self.engine) as session:
            self._add_guides(session)
            refresh_command_shell(
                session,
                "default",
                "req",
                "prd-writing",
                title="PRD",
                guides=["prd-writing", "proposal-template", "design-template"],
                sensors=[],
            )
            session.commit()

            shell = refresh_command_shell(
                session,
                "default",
                "req",
                "prd-writing",
                title="PRD",
                guides=["prd-writing"],
                sensors=[],
            )
            session.commit()
            self.assertNotIn("Templates（2）", shell.appendix)
            self.assertNotIn("proposal-template", shell.appendix)

    def test_orphan_delete_only_when_last_task(self) -> None:
        with Session(self.engine) as session:
            self._add_guides(session)
            session.add(
                StageTask(
                    org_id="default",
                    profile_key="*",
                    stage="req",
                    task_id="prd-writing",
                    title_zh="PRD",
                )
            )
            session.add(
                StageTask(
                    org_id="default",
                    profile_key="standard",
                    stage="req",
                    task_id="prd-writing",
                    title_zh="PRD std",
                )
            )
            refresh_command_shell(
                session,
                "default",
                "req",
                "prd-writing",
                title="PRD",
                guides=["prd-writing"],
                sensors=[],
            )
            session.commit()

            # Still one StageTask left after deleting conceptually one profile row
            first = session.exec(
                select(StageTask).where(StageTask.profile_key == "standard")
            ).first()
            assert first is not None
            session.delete(first)
            session.flush()
            self.assertFalse(delete_command_shell_if_orphan(session, "default", "req", "prd-writing"))
            session.commit()

            shells = session.exec(select(CommandShell)).all()
            self.assertEqual(len(shells), 1)

            last = session.exec(select(StageTask)).first()
            assert last is not None
            session.delete(last)
            session.flush()
            self.assertTrue(delete_command_shell_if_orphan(session, "default", "req", "prd-writing"))
            session.commit()
            self.assertEqual(session.exec(select(CommandShell)).all(), [])

    def test_template_package_primary_in_appendix(self) -> None:
        with Session(self.engine) as session:
            session.add(
                Guide(
                    org_id="default",
                    asset_id="database-design",
                    name="DB",
                    kind="guide.skill",
                    content="## 输入\n- `<inputs>`：输入。\n",
                )
            )
            session.add(
                Guide(
                    org_id="default",
                    asset_id="arch-db-design-template",
                    name="DB Tpl",
                    kind="guide.template",
                    content_mode="package",
                    package_files_json='["4-数据库设计文档示例.docx"]',
                    content="# stub\n",
                )
            )
            session.commit()
            shell = refresh_command_shell(
                session,
                "default",
                "arch",
                "database-design",
                title="数据库设计",
                guides=["database-design", "arch-db-design-template"],
                sensors=["arch-database-design-complete"],
            )
            session.commit()
            self.assertIn("4-数据库设计文档示例.docx", shell.appendix)
            self.assertIn("docs/architecture/database-design.docx", shell.appendix)
            self.assertIn("扩展名 `.docx`", shell.appendix)


if __name__ == "__main__":
    unittest.main()