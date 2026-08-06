from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel, Column, Text


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---- Identity ----


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: str = Field(default="", index=True, unique=True)
    display_name: str = ""
    avatar_url: str = ""
    hashed_password: str
    is_active: bool = True
    roles: str = "member"  # comma-separated: org_admin,project_owner,approver,member
    created_at: datetime = Field(default_factory=utcnow)


# ---- Org settings & assets ----


class OrgSettings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: str = Field(default="default", unique=True, index=True)
    org_name: str = "Default Org"
    github_repo: str = ""
    github_branch: str = "main"
    github_token: str = ""  # prefer env; field for UI override
    # JSON list: [{id, title, desc, category}] — org-defined guide.* kinds
    guide_kinds_json: str = Field(default="[]", sa_column=Column(Text))
    # JSON: {stages: {req: {root, aliases, named}, ...}} — deliverable path layout
    path_layout_json: str = Field(default="", sa_column=Column(Text))
    updated_at: datetime = Field(default_factory=utcnow)


class Profile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: str = Field(default="default", index=True)
    key: str = Field(index=True)  # lite|standard|strict|enterprise
    title: str = ""
    description: str = ""
    stages_json: str = "[]"  # JSON list of stage ids
    created_at: datetime = Field(default_factory=utcnow)


class StageTask(SQLModel, table=True):
    """Task definition under a stage, optionally scoped to a profile."""

    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: str = Field(default="default", index=True)
    profile_key: str = Field(default="*", index=True)  # * = all profiles template
    stage: str = Field(index=True)
    task_id: str = Field(index=True)
    title_zh: str = ""
    title_en: str = ""
    required: bool = True
    suite: str = ""
    guides_json: str = "[]"
    sensors_json: str = "[]"
    enabled: bool = True
    sort_order: int = 0


class Guide(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: str = Field(default="default", index=True)
    asset_id: str = Field(index=True)
    name: str = ""
    # guide.skill|template|constraint|exemplar|scaffold|glossary|capability|custom guide.* (+ legacy workflow/command)
    kind: str = "guide.skill"
    stage: str = ""
    task: str = ""
    version: str = "1.0.0"
    status: str = "draft"
    source: str = ""  # human-editable provenance label, max 16 chars
    content: str = Field(default="", sa_column=Column(Text))
    content_mode: str = "markdown"  # text|markdown|package
    package_path: str = ""  # relative to data_dir, e.g. guide-packages/default/id/1.0.0
    package_files_json: str = "[]"
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Sensor(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: str = Field(default="default", index=True)
    asset_id: str = Field(index=True)
    name: str = ""
    kind: str = "sensor.rule"  # sensor.rule|sensor.shell|sensor.inline|sensor.rubric
    stage: str = ""
    task: str = ""
    version: str = "1.0.0"
    status: str = "draft"
    check_type: str = "rules"  # inline|shell|rules|human（manual 写入时归一为 human）
    triggers_json: str = '["hook:stop","cli","task-shell"]'
    scope_json: str = "[]"
    config_json: str = "{}"
    content: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)


class Suite(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: str = Field(default="default", index=True)
    name: str = Field(index=True)
    sensors_json: str = "[]"
    description: str = ""


class ProjectSuite(SQLModel, table=True):
    """Deprecated: kept for DB compatibility; product no longer uses suites."""

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    name: str = Field(index=True)
    sensors_json: str = "[]"
    description: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class CommandShell(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: str = Field(default="default", index=True)
    stage: str = Field(index=True)
    task: str = Field(index=True)
    slash_name: str = ""  # hx-req-prd-writing / nhx-…
    description: str = ""
    body: str = Field(default="", sa_column=Column(Text))
    appendix: str = Field(default="", sa_column=Column(Text))
    # Emit to IDE: command | skill | both
    impl: str = Field(default="both")
    updated_at: datetime = Field(default_factory=utcnow)


class PushJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: str = Field(default="default", index=True)
    kind: str = "push"  # push|dry-run
    status: str = "pending"  # pending|success|failed
    remote: str = ""
    branch: str = ""
    commit_sha: str = ""
    message: str = Field(default="", sa_column=Column(Text))
    diff_text: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)


# ---- Project ----


class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    slug: str = Field(unique=True, index=True)
    profile_key: str = "standard"
    github_repo: str = ""
    github_branch: str = "main"
    github_token: str = ""  # project-scoped PAT; prefer over org token for project sync
    current_stage: str = "req"
    current_task: str = ""
    description: str = ""
    config_json: str = "{}"
    created_by_user_id: Optional[int] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ProjectMember(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    user_id: int = Field(index=True)
    role: str = "member"  # project_owner|approver|member
    created_at: datetime = Field(default_factory=utcnow)


class ProjectGuide(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    asset_id: str = Field(index=True)
    name: str = ""
    kind: str = "guide.skill"
    stage: str = ""
    task: str = ""
    content: str = Field(default="", sa_column=Column(Text))
    status: str = "draft"  # draft|trial|enforced
    source: str = ""  # org|project — empty until set; org-copied vs project-private
    version: str = "1.0.0"
    content_mode: str = "markdown"
    created_at: datetime = Field(default_factory=utcnow)


class ProjectSensor(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    asset_id: str = Field(index=True)
    name: str = ""
    kind: str = "sensor.rule"
    stage: str = ""
    task: str = ""
    check_type: str = "rules"
    triggers_json: str = '["hook:stop","cli","task-shell"]'
    scope_json: str = "[]"
    content: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)


class ProjectTask(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    stage: str = Field(index=True)
    task_id: str = Field(index=True)
    title: str = ""
    required: bool = False
    suite: str = ""
    guides_json: str = "[]"
    sensors_json: str = "[]"
    custom: bool = True
    sort_order: int = 0


class Artifact(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    name: str
    stage: str = ""
    task: str = ""
    path_hint: str = ""
    latest_version: int = 0
    updated_at: datetime = Field(default_factory=utcnow)


class ArtifactVersion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    artifact_id: int = Field(index=True)
    version: int
    storage_path: str
    note: str = ""
    created_by: str = ""
    content_kind: str = "file"  # file|package
    files_json: str = "[]"
    created_at: datetime = Field(default_factory=utcnow)


class Ticket(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ticket_no: str = Field(unique=True, index=True)
    project_id: int = Field(index=True)
    title: str
    ticket_type: str = "req-review"  # req-review|arch-approve|artifact-release|human-check|other
    status: str = "draft"  # draft|submitted|approved|rejected
    submitter: str = ""
    assignee_role: str = "approver"
    stage: str = ""
    task: str = ""
    artifact_name: str = ""
    body: str = Field(default="", sa_column=Column(Text))
    decision_note: str = Field(default="", sa_column=Column(Text))
    decided_by: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class AssetSubmission(SQLModel, table=True):
    """Project → org asset promotion request (Guide/Sensor)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    submission_no: str = Field(unique=True, index=True)
    project_id: int = Field(index=True)
    org_id: str = Field(default="default", index=True)
    reason: str = Field(default="", sa_column=Column(Text))  # commit / submit reason
    status: str = "submitted"  # submitted|approved|rejected|partial
    submitter: str = ""
    decided_by: str = ""
    decision_note: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)
    decided_at: Optional[datetime] = None


class AssetSubmissionItem(SQLModel, table=True):
    """One Guide or Sensor snapshot inside an AssetSubmission."""

    id: Optional[int] = Field(default=None, primary_key=True)
    submission_id: int = Field(index=True)
    asset_kind: str = Field(index=True)  # guide|sensor
    asset_id: str = Field(index=True)
    source_project_row_id: int = 0
    # snapshot
    kind: str = ""
    content: str = Field(default="", sa_column=Column(Text))
    check_type: str = ""
    triggers_json: str = "[]"
    scope_json: str = "[]"
    version: str = "1.0.0"
    # decision
    item_status: str = "pending"  # pending|accepted|skipped
    target_status: str = ""  # trial|enforced when accepted


class SyncJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    status: str = "pending"
    remote: str = ""
    branch: str = ""
    commit_sha: str = ""
    message: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)


class ProjectOperationLog(SQLModel, table=True):
    """Audit trail for project-side HX / member / asset operations."""

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    actor_user_id: Optional[int] = Field(default=None, index=True)
    actor_username: str = ""
    action: str = Field(index=True)  # init_config|sync_config|member_add|...
    summary: str = ""
    detail_json: str = Field(default="{}", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)


class TaskShellRunLog(SQLModel, table=True):
    """Runtime usage logs for nhx command/skill task shells."""

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    stage: str = Field(default="", index=True)
    task_id: str = Field(default="", index=True)
    runner_username: str = Field(default="", index=True)
    trigger_mode: str = Field(default="command")  # command|skill
    ide: str = Field(default="unknown")
    source: str = Field(default="nhx")
    run_at: datetime = Field(default_factory=utcnow, index=True)


class OrgOperationLog(SQLModel, table=True):
    """Audit trail for organization-side HX / settings / user operations."""

    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: str = Field(default="default", index=True)
    actor_user_id: Optional[int] = Field(default=None, index=True)
    actor_username: str = ""
    action: str = Field(index=True)  # bootstrap|guide_create|task_update|...
    summary: str = ""
    detail_json: str = Field(default="{}", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=utcnow)
