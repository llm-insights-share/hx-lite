import unittest
from datetime import datetime, timedelta, timezone

from sqlmodel import SQLModel, Session, create_engine, select

from app.core.models import Project, ProjectMember, ProjectOperationLog, TaskShellRunLog, User
from app.core.security import hash_password
from app.modules.project.router import (
    normalize_ide_name,
    TaskShellRunIn,
    _usage_series_30d,
    project_dashboard,
    report_task_shell_run,
)


class DashboardUsageMetricsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        SQLModel.metadata.create_all(self.engine)

    def test_project_dashboard_contains_usage_counts(self) -> None:
        now = datetime.now(timezone.utc)
        with Session(self.engine) as session:
            session.add(Project(name="P1", slug="p1"))
            session.add(
                TaskShellRunLog(
                    project_id=1,
                    stage="req",
                    task_id="prd",
                    runner_username="alice",
                    run_at=now - timedelta(days=5),
                )
            )
            session.add(
                TaskShellRunLog(
                    project_id=1,
                    stage="dev",
                    task_id="impl",
                    runner_username="bob",
                    run_at=now - timedelta(days=35),
                )
            )
            session.add(
                TaskShellRunLog(
                    project_id=1,
                    stage="req",
                    task_id="prd",
                    runner_username="alice",
                    run_at=now - timedelta(days=2),
                )
            )
            session.commit()

            data = project_dashboard(session, None)  # type: ignore[arg-type]

            self.assertEqual(data["shell_run_count_total"], 3)
            self.assertEqual(data["shell_run_count_30d"], 2)
            self.assertEqual(data["shell_run_user_count_total"], 2)
            self.assertEqual(data["shell_run_user_count_30d"], 1)
            self.assertEqual(data["shell_run_window_days"], 30)

            user_series = data["shell_run_user_series_30d"]
            count_series = data["shell_run_count_series_30d"]
            self.assertEqual(len(user_series), 30)
            self.assertEqual(len(count_series), 30)

            day5 = (now - timedelta(days=5)).date().isoformat()
            day2 = (now - timedelta(days=2)).date().isoformat()
            by_user = {p["date"]: p["value"] for p in user_series}
            by_count = {p["date"]: p["value"] for p in count_series}
            self.assertEqual(by_user[day5], 1)
            self.assertEqual(by_user[day2], 1)
            self.assertEqual(by_count[day5], 1)
            self.assertEqual(by_count[day2], 1)
            # days without logs are zero
            zero_days = [p for p in count_series if p["date"] not in (day5, day2)]
            self.assertTrue(all(p["value"] == 0 for p in zero_days))

    def test_usage_series_helper_length_and_zeros(self) -> None:
        now = datetime.now(timezone.utc)
        rows = [
            TaskShellRunLog(
                project_id=1,
                stage="req",
                task_id="a",
                runner_username="alice",
                run_at=now,
            ),
            TaskShellRunLog(
                project_id=1,
                stage="req",
                task_id="b",
                runner_username="bob",
                run_at=now,
            ),
            TaskShellRunLog(
                project_id=1,
                stage="req",
                task_id="c",
                runner_username="alice",
                run_at=now,
            ),
        ]
        user_series, count_series = _usage_series_30d(rows, now)
        self.assertEqual(len(user_series), 30)
        self.assertEqual(len(count_series), 30)
        self.assertEqual(user_series[-1]["date"], now.date().isoformat())
        self.assertEqual(user_series[-1]["value"], 2)
        self.assertEqual(count_series[-1]["value"], 3)
        self.assertTrue(all(p["value"] == 0 for p in count_series[:-1]))

    def test_report_task_shell_run_requires_project_member(self) -> None:
        with Session(self.engine) as session:
            user = User(
                username="u1",
                email="u1@localhost",
                hashed_password=hash_password("pw"),
                roles="member",
            )
            project = Project(name="P1", slug="p1")
            session.add(user)
            session.add(project)
            session.commit()
            session.refresh(user)
            session.refresh(project)
            session.add(ProjectMember(project_id=project.id, user_id=user.id, role="member"))  # type: ignore[arg-type]
            session.commit()

            res = report_task_shell_run(
                project.id,  # type: ignore[arg-type]
                TaskShellRunIn(stage="req", task_id="prd-writing", trigger_mode="command", ide="cursor"),
                session,
                user,
            )
            self.assertTrue(res["ok"])
            self.assertIsNotNone(res["id"])
            session.refresh(project)
            self.assertEqual(project.current_stage, "req")
            self.assertEqual(project.current_task, "prd-writing")
            logs = session.exec(
                select(ProjectOperationLog).where(ProjectOperationLog.project_id == project.id)
            ).all()
            self.assertEqual(len(logs), 1)
            self.assertEqual(logs[0].action, "task_shell_run")
            self.assertIn("req/prd-writing", logs[0].summary)

            res2 = report_task_shell_run(
                project.id,  # type: ignore[arg-type]
                TaskShellRunIn(stage="dev", task_id="apply", trigger_mode="skill", ide="cursor"),
                session,
                user,
            )
            self.assertTrue(res2["ok"])
            session.refresh(project)
            self.assertEqual(project.current_stage, "dev")
            self.assertEqual(project.current_task, "apply")
            self.assertEqual(res2.get("current_stage"), "dev")
            self.assertEqual(res2.get("current_task"), "apply")
            logs2 = session.exec(
                select(ProjectOperationLog).where(ProjectOperationLog.project_id == project.id)
            ).all()
            self.assertEqual(len(logs2), 2)
            self.assertTrue(any(l.action == "task_shell_run" and "dev/apply" in l.summary for l in logs2))

    def test_report_task_shell_run_normalizes_ide(self) -> None:
        with Session(self.engine) as session:
            user = User(
                username="u2",
                email="u2@localhost",
                hashed_password=hash_password("pw"),
                roles="member",
            )
            project = Project(name="P2", slug="p2")
            session.add(user)
            session.add(project)
            session.commit()
            session.refresh(user)
            session.refresh(project)
            session.add(ProjectMember(project_id=project.id, user_id=user.id, role="member"))  # type: ignore[arg-type]
            session.commit()

            report_task_shell_run(
                project.id,  # type: ignore[arg-type]
                TaskShellRunIn(stage="req", task_id="prd-writing", trigger_mode="command", ide="CodeBuddy"),
                session,
                user,
            )
            row = session.exec(select(TaskShellRunLog).where(TaskShellRunLog.project_id == project.id)).first()
            assert row is not None
            self.assertEqual(row.ide, "codebuddy")

    def test_normalize_ide_name(self) -> None:
        self.assertEqual(normalize_ide_name("cursor"), "cursor")
        self.assertEqual(normalize_ide_name(" WorkBuddy "), "workbuddy")
        self.assertEqual(normalize_ide_name("TRAE-CN"), "trae-cn")
        self.assertEqual(normalize_ide_name("Qoder"), "qoder")
        self.assertEqual(normalize_ide_name("other-ide"), "unknown")
if __name__ == "__main__":
    unittest.main()
