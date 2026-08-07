"""Tests for org catalog + demo project seed import."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from sqlmodel import Session, SQLModel, create_engine, select

from app.core.models import Guide, OrgSettings, Profile, Project, ProjectGuide, ProjectTask, StageTask
from app.domain.org_seed import ensure_demo_projects, import_org_seed, seed_available


def _write_minimal_seed(root: Path) -> None:
    (root / "packages" / "org" / "demo-tpl" / "1.0.0").mkdir(parents=True)
    (root / "packages" / "org" / "demo-tpl" / "1.0.0" / "template.docx").write_bytes(b"PK\x03\x04seed")
    (root / "manifest.json").write_text(
        json.dumps({"version": "1.0", "org_id": "default", "counts": {}}),
        encoding="utf-8",
    )
    (root / "org_settings.json").write_text(
        json.dumps(
            {
                "org_id": "default",
                "org_name": "Seed Org",
                "guide_kinds_json": "[]",
                "path_layout_json": '{"stages":{}}',
            }
        ),
        encoding="utf-8",
    )
    (root / "profiles.json").write_text(
        json.dumps([{"key": "standard", "title": "Standard", "description": "", "stages_json": '["req"]'}]),
        encoding="utf-8",
    )
    (root / "stage_tasks.json").write_text(
        json.dumps(
            [
                {
                    "profile_key": "*",
                    "stage": "req",
                    "task_id": "t1",
                    "title_zh": "任务一",
                    "title_en": "T1",
                    "required": True,
                    "suite": "",
                    "guides_json": '["demo-tpl"]',
                    "sensors_json": "[]",
                    "enabled": True,
                    "sort_order": 0,
                }
            ]
        ),
        encoding="utf-8",
    )
    (root / "guides.json").write_text(
        json.dumps(
            [
                {
                    "asset_id": "demo-tpl",
                    "name": "Demo Template",
                    "kind": "guide.template",
                    "version": "1.0.0",
                    "status": "enforced",
                    "content": "# demo",
                    "content_mode": "package",
                    "package_path": "guide-packages/default/demo-tpl/1.0.0",
                    "package_files_json": '["template.docx"]',
                    "ref_skills_json": "[]",
                }
            ]
        ),
        encoding="utf-8",
    )
    (root / "sensors.json").write_text("[]", encoding="utf-8")
    (root / "command_shells.json").write_text("[]", encoding="utf-8")
    (root / "projects.json").write_text(
        json.dumps(
            [
                {
                    "seed_key": "demo-seed",
                    "name": "Demo Seed",
                    "slug": "demo-seed",
                    "profile_key": "standard",
                    "current_stage": "req",
                    "current_task": "t1",
                    "description": "seeded",
                    "config_json": '{"profile":"standard"}',
                }
            ]
        ),
        encoding="utf-8",
    )
    (root / "project_tasks.json").write_text(
        json.dumps(
            [
                {
                    "seed_key": "demo-seed",
                    "stage": "req",
                    "task_id": "t1",
                    "title": "Task 1",
                    "required": True,
                    "guides_json": '["demo-tpl"]',
                    "sensors_json": "[]",
                    "custom": False,
                    "sort_order": 0,
                }
            ]
        ),
        encoding="utf-8",
    )
    (root / "project_guides.json").write_text(
        json.dumps(
            [
                {
                    "seed_key": "demo-seed",
                    "asset_id": "demo-tpl",
                    "name": "Demo Template",
                    "kind": "guide.template",
                    "content": "# demo",
                    "status": "enforced",
                    "source": "org",
                    "version": "1.0.0",
                    "content_mode": "package",
                    "package_path": "guide-packages/default/demo-tpl/1.0.0",
                    "package_files_json": '["template.docx"]',
                    "ref_skills_json": "[]",
                }
            ]
        ),
        encoding="utf-8",
    )
    (root / "project_sensors.json").write_text("[]", encoding="utf-8")


class OrgSeedTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
        SQLModel.metadata.create_all(self.engine)
        self._tmp = TemporaryDirectory()
        self.data_dir = Path(self._tmp.name) / "data"
        self.data_dir.mkdir()
        self.seed_dir = Path(self._tmp.name) / "seed"
        _write_minimal_seed(self.seed_dir)

        class _S:
            pass

        self.settings = _S()
        self.settings.data_dir = self.data_dir  # type: ignore[attr-defined]

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_seed_available(self) -> None:
        self.assertTrue(seed_available(self.seed_dir))
        self.assertFalse(seed_available(Path(self._tmp.name) / "missing"))

    def test_import_org_and_demo_project(self) -> None:
        with patch("app.domain.org_seed.get_settings", return_value=self.settings):
            with Session(self.engine) as session:
                result = import_org_seed(
                    session,
                    org_id="default",
                    clear_org=True,
                    seed_dir=self.seed_dir,
                    include_projects=True,
                )
                self.assertEqual(result["guides"], 1)
                self.assertEqual(result["demo_projects"]["created"], 1)

                settings = session.exec(select(OrgSettings)).first()
                assert settings is not None
                self.assertEqual(settings.org_name, "Seed Org")
                self.assertEqual(session.exec(select(Profile)).first().key, "standard")  # type: ignore[union-attr]
                self.assertEqual(session.exec(select(StageTask)).first().task_id, "t1")  # type: ignore[union-attr]
                guide = session.exec(select(Guide)).first()
                assert guide is not None
                self.assertEqual(guide.content_mode, "package")
                pkg = self.data_dir / "guide-packages" / "default" / "demo-tpl" / "1.0.0" / "template.docx"
                self.assertTrue(pkg.is_file())

                project = session.exec(select(Project).where(Project.slug == "demo-seed")).first()
                assert project is not None
                self.assertEqual(project.name, "Demo Seed")
                tasks = session.exec(select(ProjectTask).where(ProjectTask.project_id == project.id)).all()
                self.assertEqual(len(tasks), 1)
                pguides = session.exec(select(ProjectGuide).where(ProjectGuide.project_id == project.id)).all()
                self.assertEqual(len(pguides), 1)

    def test_ensure_demo_projects_skips_existing(self) -> None:
        with patch("app.domain.org_seed.get_settings", return_value=self.settings):
            with Session(self.engine) as session:
                import_org_seed(
                    session,
                    clear_org=True,
                    seed_dir=self.seed_dir,
                    include_projects=True,
                )
                again = ensure_demo_projects(session, seed_dir=self.seed_dir)
                self.assertEqual(again["created"], 0)
                self.assertEqual(again["skipped"], 1)
                self.assertEqual(len(session.exec(select(Project)).all()), 1)


if __name__ == "__main__":
    unittest.main()
