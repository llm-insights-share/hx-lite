import json
import unittest

from sqlmodel import Session, SQLModel, create_engine

from app.core.models import Artifact, Project, ProjectSensor, ProjectTask, TaskShellRunLog, Ticket
from app.domain.project_progress import build_project_progress, task_is_complete


class ProjectProgressTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
        SQLModel.metadata.create_all(self.engine)

    def _seed_base(self, session: Session) -> Project:
        project = Project(
            name="P",
            slug="p-progress",
            current_stage="req",
            current_task="t1",
            config_json=json.dumps({"stages": ["req", "arch"]}),
        )
        session.add(project)
        session.commit()
        session.refresh(project)
        session.add(
            ProjectTask(
                project_id=project.id,  # type: ignore[arg-type]
                stage="req",
                task_id="t1",
                title="Task One",
                sensors_json="[]",
                sort_order=0,
            )
        )
        session.add(
            ProjectTask(
                project_id=project.id,  # type: ignore[arg-type]
                stage="req",
                task_id="t2",
                title="Task Two",
                sensors_json='["human-gate"]',
                sort_order=1,
            )
        )
        session.add(
            ProjectTask(
                project_id=project.id,  # type: ignore[arg-type]
                stage="arch",
                task_id="a1",
                title="Arch One",
                sensors_json="[]",
                sort_order=0,
            )
        )
        session.add(
            ProjectSensor(
                project_id=project.id,  # type: ignore[arg-type]
                asset_id="human-gate",
                name="Human",
                kind="sensor.human",
                check_type="human",
            )
        )
        session.commit()
        return project

    def test_no_artifact_incomplete(self) -> None:
        with Session(self.engine) as session:
            project = self._seed_base(session)
            progress = build_project_progress(session, project)
            self.assertEqual(progress["completed_tasks"], [])
            self.assertEqual(progress["completed_stages"], [])
            self.assertEqual(progress["current_stage"], "req")
            self.assertEqual(progress["current_task"], "t1")
            self.assertEqual(progress["current_task_title"], "Task One")

    def test_artifact_without_human_completes(self) -> None:
        with Session(self.engine) as session:
            project = self._seed_base(session)
            session.add(
                Artifact(
                    project_id=project.id,  # type: ignore[arg-type]
                    name="doc",
                    stage="req",
                    task="t1",
                )
            )
            session.commit()
            progress = build_project_progress(session, project)
            self.assertEqual(
                [(x["stage"], x["task_id"]) for x in progress["completed_tasks"]],
                [("req", "t1")],
            )
            self.assertNotIn("req", progress["completed_stages"])

    def test_shell_run_completes_non_human(self) -> None:
        with Session(self.engine) as session:
            project = self._seed_base(session)
            session.add(
                TaskShellRunLog(
                    project_id=project.id,  # type: ignore[arg-type]
                    stage="req",
                    task_id="t1",
                    trigger_mode="command",
                )
            )
            session.commit()
            progress = build_project_progress(session, project)
            self.assertEqual(
                [(x["stage"], x["task_id"]) for x in progress["completed_tasks"]],
                [("req", "t1")],
            )

    def test_shell_alone_does_not_complete_human(self) -> None:
        with Session(self.engine) as session:
            project = self._seed_base(session)
            session.add(
                TaskShellRunLog(
                    project_id=project.id,  # type: ignore[arg-type]
                    stage="req",
                    task_id="t2",
                    trigger_mode="command",
                )
            )
            session.commit()
            progress = build_project_progress(session, project)
            self.assertEqual(progress["completed_tasks"], [])

    def test_human_needs_approval(self) -> None:
        with Session(self.engine) as session:
            project = self._seed_base(session)
            session.add(
                Artifact(
                    project_id=project.id,  # type: ignore[arg-type]
                    name="doc2",
                    stage="req",
                    task="t2",
                )
            )
            session.commit()
            progress = build_project_progress(session, project)
            self.assertEqual(progress["completed_tasks"], [])

            session.add(
                Ticket(
                    ticket_no="T-1",
                    project_id=project.id,  # type: ignore[arg-type]
                    title="review",
                    ticket_type="human-check",
                    status="approved",
                    stage="req",
                    task="t2",
                )
            )
            session.commit()
            progress = build_project_progress(session, project)
            self.assertEqual(
                [(x["stage"], x["task_id"]) for x in progress["completed_tasks"]],
                [("req", "t2")],
            )

    def test_stage_complete_when_all_tasks_done(self) -> None:
        with Session(self.engine) as session:
            project = self._seed_base(session)
            session.add(
                Artifact(
                    project_id=project.id,  # type: ignore[arg-type]
                    name="a",
                    stage="req",
                    task="t1",
                )
            )
            session.add(
                Artifact(
                    project_id=project.id,  # type: ignore[arg-type]
                    name="b",
                    stage="req",
                    task="t2",
                )
            )
            session.add(
                Ticket(
                    ticket_no="T-2",
                    project_id=project.id,  # type: ignore[arg-type]
                    title="review",
                    ticket_type="human-check",
                    status="approved",
                    stage="req",
                    task="t2",
                )
            )
            session.commit()
            progress = build_project_progress(session, project)
            self.assertEqual(progress["completed_stages"], ["req"])
            self.assertEqual(len(progress["completed_tasks"]), 2)

    def test_stage_before_current_counts_as_completed(self) -> None:
        with Session(self.engine) as session:
            project = self._seed_base(session)
            project.current_stage = "dev"
            project.config_json = json.dumps({"stages": ["req", "arch", "dev"]})
            session.add(project)
            session.commit()
            # Only a1 evidenced; req incomplete — but arch/req before current should pass
            session.add(
                TaskShellRunLog(
                    project_id=project.id,  # type: ignore[arg-type]
                    stage="arch",
                    task_id="a1",
                    trigger_mode="command",
                )
            )
            session.commit()
            progress = build_project_progress(session, project)
            self.assertEqual(progress["completed_stages"], ["req", "arch"])

    def test_completed_tasks_newest_first(self) -> None:
        with Session(self.engine) as session:
            project = self._seed_base(session)
            from datetime import datetime, timedelta, timezone

            older = datetime(2026, 8, 1, tzinfo=timezone.utc)
            newer = older + timedelta(days=2)
            session.add(
                TaskShellRunLog(
                    project_id=project.id,  # type: ignore[arg-type]
                    stage="req",
                    task_id="t1",
                    trigger_mode="command",
                    run_at=older,
                )
            )
            session.add(
                TaskShellRunLog(
                    project_id=project.id,  # type: ignore[arg-type]
                    stage="arch",
                    task_id="a1",
                    trigger_mode="command",
                    run_at=newer,
                )
            )
            session.commit()
            progress = build_project_progress(session, project)
            ids = [(x["stage"], x["task_id"]) for x in progress["completed_tasks"]]
            self.assertEqual(ids[0], ("arch", "a1"))
            self.assertIn(("req", "t1"), ids)

    def test_task_is_complete_helper(self) -> None:
        task = ProjectTask(
            project_id=1,
            stage="req",
            task_id="t1",
            sensors_json='["human-gate"]',
        )
        self.assertFalse(
            task_is_complete(
                task=task,
                human_sensor_ids={"human-gate"},
                artifact_keys=set(),
                approved_human_keys=set(),
                shell_keys={("req", "t1")},
            )
        )
        self.assertFalse(
            task_is_complete(
                task=task,
                human_sensor_ids={"human-gate"},
                artifact_keys={("req", "t1")},
                approved_human_keys=set(),
            )
        )
        self.assertTrue(
            task_is_complete(
                task=task,
                human_sensor_ids={"human-gate"},
                artifact_keys={("req", "t1")},
                approved_human_keys={("req", "t1")},
            )
        )
        non_human = ProjectTask(project_id=1, stage="req", task_id="t1", sensors_json="[]")
        self.assertTrue(
            task_is_complete(
                task=non_human,
                human_sensor_ids=set(),
                artifact_keys=set(),
                approved_human_keys=set(),
                shell_keys={("req", "t1")},
            )
        )


if __name__ == "__main__":
    unittest.main()
