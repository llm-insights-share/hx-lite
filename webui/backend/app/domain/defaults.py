"""Default Profile → Stage → Task matrix (ported from stages.ts / stage-task-assets)."""

from __future__ import annotations

import json
from typing import Any

STAGES = ["req", "arch", "dev", "test"]

STAGE_TASKS: dict[str, list[dict[str, Any]]] = {
    "req": [
        {
            "id": "biz-understanding",
            "title_zh": "业务理解",
            "title_en": "Business understanding",
            "required": False,
            "guides": ["biz-understanding-outline", "requirements-research-outline"],
            "sensors": ["req-biz-understanding"],
        },
        {
            "id": "requirements-research",
            "title_zh": "需求调研",
            "title_en": "Requirements research",
            "required": False,
            "guides": ["requirements-research-outline"],
            "sensors": ["req-research-complete"],
        },
        {
            "id": "requirements-analysis",
            "title_zh": "需求分析",
            "title_en": "Requirements analysis",
            "required": True,
            "guides": ["requirements-analysis"],
            "sensors": ["req-analysis-complete"],
        },
        {
            "id": "prototype-design",
            "title_zh": "产品原型设计",
            "title_en": "Prototype design",
            "required": True,
            "guides": ["prototype-wireframe"],
            "sensors": ["org-prototype-complete"],
        },
        {
            "id": "prd-writing",
            "title_zh": "产品需求文档编写",
            "title_en": "PRD writing",
            "required": True,
            "guides": ["prd-template", "prd-authoring"],
            "sensors": ["prd-complete", "prd-approved"],
        },
    ],
    "arch": [
        {
            "id": "subsystem-division",
            "title_zh": "子系统划分",
            "title_en": "Subsystem division",
            "required": True,
            "guides": ["arch-hld-template", "arch-authoring"],
            "sensors": ["arch-hld-complete", "arch-registry-complete"],
        },
        {
            "id": "tech-selection",
            "title_zh": "技术选型",
            "title_en": "Technology selection",
            "required": True,
            "guides": ["tech-selection"],
            "sensors": ["arch-tech-selection-complete"],
        },
        {
            "id": "database-design",
            "title_zh": "数据库设计",
            "title_en": "Database design",
            "required": True,
            "guides": ["database-design", "db-migration-template"],
            "sensors": ["arch-database-design-complete"],
        },
        {
            "id": "interface-design",
            "title_zh": "接口设计",
            "title_en": "Interface design",
            "required": True,
            "guides": ["interface-design", "api-contract-template"],
            "sensors": ["arch-interface-design-complete"],
        },
        {
            "id": "key-mechanisms",
            "title_zh": "关键设计机制",
            "title_en": "Key design mechanisms",
            "required": False,
            "guides": ["key-mechanisms"],
            "sensors": ["arch-key-mechanisms-complete"],
        },
        {
            "id": "internal-interface",
            "title_zh": "内部接口设计",
            "title_en": "Internal interface design",
            "required": True,
            "guides": ["arch-lld-template", "arch-module-boundary"],
            "sensors": ["arch-lld-complete", "arch-lld-approved"],
        },
    ],
    "dev": [
        {
            "id": "plan",
            "title_zh": "开发计划",
            "title_en": "Development plan",
            "required": True,
            "guides": ["change-planning", "rollback-template"],
            "sensors": ["plan-coverage"],
        },
        {
            "id": "propose",
            "title_zh": "change:propose",
            "title_en": "change:propose",
            "required": True,
            "guides": ["proposal-template", "requirements-template", "prd-writing", "spec-writing"],
            "sensors": ["requirements-complete", "spec-validate"],
        },
        {
            "id": "design",
            "title_zh": "change:design",
            "title_en": "change:design",
            "required": True,
            "guides": ["design-template", "ui-pages-template", "fe-layout", "design-tokens"],
            "sensors": ["design-hld-complete", "design-lld-complete"],
        },
        {
            "id": "apply",
            "title_zh": "change:apply",
            "title_en": "change:apply",
            "required": True,
            "guides": ["coding-conventions"],
            "sensors": ["spec-validate", "typecheck", "lint", "unit-changed"],
        },
        {
            "id": "verify",
            "title_zh": "change:verify",
            "title_en": "change:verify",
            "required": True,
            "guides": ["release-readiness-checklist"],
            "sensors": ["spec-validate", "spec-trace", "drift", "integration-smoke"],
        },
        {
            "id": "archive",
            "title_zh": "change:archive",
            "title_en": "change:archive",
            "required": True,
            "guides": ["archive-checklist"],
            "sensors": ["spec-validate"],
        },
    ],
    "test": [
        {
            "id": "test-case-design",
            "title_zh": "测试用例设计",
            "title_en": "Test case design",
            "required": True,
            "guides": ["test-case-authoring", "test-cases-template"],
            "sensors": ["test-cases-complete", "test-cases-approved"],
        },
        {
            "id": "test-execution",
            "title_zh": "测试任务执行",
            "title_en": "Test execution",
            "required": True,
            "guides": ["test-execution", "uat-checklist"],
            "sensors": ["uat-complete", "bugs-closed", "test-report-complete"],
        },
    ],
}

PROFILE_DEFS: dict[str, dict[str, Any]] = {
    "lite": {
        "title": "Lite",
        "description": "快速 hotfix：仅 dev 阶段 propose/apply/archive",
        "stages": ["dev"],
        "tasks": {"dev": ["propose", "apply", "archive"]},
    },
    "standard": {
        "title": "Standard",
        "description": "标准四阶段交付",
        "stages": ["req", "arch", "dev", "test"],
        "tasks": {
            "req": ["requirements-analysis", "prototype-design", "prd-writing"],
            "arch": [
                "subsystem-division",
                "tech-selection",
                "database-design",
                "interface-design",
                "internal-interface",
            ],
            "dev": ["plan", "propose", "design", "apply", "verify", "archive"],
            "test": ["test-case-design", "test-execution"],
        },
    },
    "strict": {
        "title": "Strict",
        "description": "与 standard 同任务集，更严 gate 策略",
        "stages": ["req", "arch", "dev", "test"],
        "tasks": {
            "req": ["requirements-analysis", "prototype-design", "prd-writing"],
            "arch": [
                "subsystem-division",
                "tech-selection",
                "database-design",
                "interface-design",
                "internal-interface",
            ],
            "dev": ["plan", "propose", "design", "apply", "verify", "archive"],
            "test": ["test-case-design", "test-execution"],
        },
    },
    "enterprise": {
        "title": "Enterprise",
        "description": "企业 SDLC：全量阶段 + 工单审批语义",
        "stages": ["req", "arch", "dev", "test"],
        "tasks": {
            "req": ["requirements-analysis", "prototype-design", "prd-writing"],
            "arch": [
                "subsystem-division",
                "tech-selection",
                "database-design",
                "interface-design",
                "internal-interface",
            ],
            "dev": ["plan", "propose", "design", "apply", "verify", "archive"],
            "test": ["test-case-design", "test-execution"],
        },
    },
}

# Profile-specific sensor overrides (replaces former suite remapping).
PROFILE_SENSOR_OVERRIDES: dict[tuple[str, str, str], list[str]] = {
    ("lite", "dev", "apply"): ["spec-validate", "typecheck"],
    ("enterprise", "dev", "plan"): ["plan-coverage", "wo-lld-done"],
    ("enterprise", "dev", "propose"): ["requirements-complete", "spec-validate"],
    ("enterprise", "dev", "design"): ["design-hld-complete", "design-lld-complete"],
    ("enterprise", "dev", "verify"): ["spec-validate", "spec-trace", "drift", "integration-smoke"],
}


def task_def(stage: str, task_id: str) -> dict[str, Any] | None:
    for t in STAGE_TASKS.get(stage, []):
        if t["id"] == task_id:
            return t
    return None


def resolve_task_sensors(stage: str, task_id: str, profile_key: str = "*") -> list[str]:
    base = task_def(stage, task_id)
    if not base:
        return []
    ov = PROFILE_SENSOR_OVERRIDES.get((profile_key, stage, task_id))
    return list(ov if ov is not None else base.get("sensors") or [])


def slash_name(stage: str, task: str) -> str:
    return f"hx-{stage}-{task.replace('_', '-')}"


def is_human_approval_sensor(asset_id: str) -> bool:
    """Sensors that gate on WebUI human-check tickets (nhx)."""
    from app.domain.sensor_specs import get_sensor_spec

    spec = get_sensor_spec(asset_id)
    if spec and spec.get("check_type") == "human":
        return True
    sid = (asset_id or "").lower()
    if not sid:
        return False
    if sid.endswith("-approved") or sid.endswith("-approval"):
        return True
    return any(k in sid for k in ("human-review", "human-check", "manual-review"))


def human_sensor_content(asset_id: str) -> str:
    from app.domain.sensor_specs import get_sensor_spec

    spec = get_sensor_spec(asset_id)
    if spec and spec.get("check_type") == "human":
        return str(spec["content"])
    return (
        "---\ncheck_type: human\n---\n\n"
        "## 检查意图\n\n"
        f"人工审批（{asset_id or 'unknown'}）。\n\n"
        "触发时仅提醒「尚未批准」，不执行自动文件/脚本检查；需人工确认后再继续。"
        "必须按序：① `nhx submit` 上传该任务产物 → ② `nhx approve request` 创建 human-check 工单 → "
        "③ WebUI 批准 → ④ `nhx check`。未上传产物不得建单。\n\n"
        "通过本门禁后再进入下一交付环节。\n"
    )


def default_sensor_check_type(asset_id: str) -> str:
    from app.domain.sensor_specs import get_sensor_spec

    spec = get_sensor_spec(asset_id)
    if spec:
        return str(spec["check_type"])
    return "human" if is_human_approval_sensor(asset_id) else "inline"


def default_sensor_payload(asset_id: str) -> dict[str, Any]:
    """Full default row fields for bootstrap / migration."""
    from app.domain.sensor_specs import DEFAULT_TRIGGERS_BASE, DEFAULT_TRIGGERS_HUMAN, get_sensor_spec

    spec = get_sensor_spec(asset_id)
    if spec:
        return {
            "check_type": spec["check_type"],
            "kind": spec.get("kind") or ("sensor.human" if spec["check_type"] == "human" else "sensor.rule"),
            "content": spec["content"],
            "config_json": spec.get("config_json") or "{}",
            "triggers_json": spec.get("triggers_json")
            or json.dumps(spec.get("triggers") or DEFAULT_TRIGGERS_BASE, ensure_ascii=False),
            "scope_json": spec.get("scope_json") or json.dumps(spec.get("scope") or [], ensure_ascii=False),
        }
    ct = default_sensor_check_type(asset_id)
    if ct == "human":
        return {
            "check_type": "human",
            "kind": "sensor.human",
            "content": human_sensor_content(asset_id),
            "config_json": json.dumps({"approval": True, "reminder_only": True}),
            "triggers_json": json.dumps(DEFAULT_TRIGGERS_HUMAN, ensure_ascii=False),
            "scope_json": "[]",
        }
    # Unknown non-human: soft inline placeholder (file.exists of a marker path under docs/)
    expr = f'file.exists(path=docs/.nhx-sensor-{asset_id})'
    return {
        "check_type": "inline",
        "kind": "sensor.rule",
        "content": f'---\ncheck_type: inline\nexpr: "{expr}"\n---\n',
        "config_json": json.dumps({"expr": expr}, ensure_ascii=False),
        "triggers_json": json.dumps(DEFAULT_TRIGGERS_BASE, ensure_ascii=False),
        "scope_json": "[]",
    }


def default_workflow_body(stage: str, task: str, title: str) -> str:
    name = slash_name(stage, task)
    return "\n".join(
        [
            f"# /{name} — {title}",
            "",
            f"你正在执行 **{stage}** 阶段任务 `{task}`。",
            "",
            "## 输入",
            "- 从斜杠命令参数或用户消息中解析输入（如 change / slug / 模块名等等）。",
            "",
            "## 步骤",
            "1. 加载本阶段/任务的 Context Pack 与约束。",
            "2. 遵循绑定的 Skill / Template（见附录「特别上下文」）。",
            "3. 产出本任务约定的交付物。",
            "",
            "## 产出",
            "- 按绑定模板与任务定义生成交付文档或代码变更。",
            "",
            "## 护栏",
            "- 已有绑定模板时，不得自行发明文档结构。",
            "- 不得伪造未确认的业务规则或接口。",
            "",
            "## 完成标准",
            "- 本阶段/任务对应的 Check 门禁通过（绿灯）。",
        ]
    )
