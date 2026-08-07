"""Default Sensor specs for AI delivery gates (content + check_type + triggers)."""

from __future__ import annotations

import json
import re
from typing import Any

# Trigger channel IDs (multi-select)
TRIGGER_HOOK_BEFORE = "hook:beforeSubmit"
TRIGGER_HOOK_AFTER_EDIT = "hook:afterFileEdit"
TRIGGER_HOOK_STOP = "hook:stop"
TRIGGER_CLI = "cli"
TRIGGER_TASK_SHELL = "task-shell"

DEFAULT_TRIGGERS_BASE = [TRIGGER_HOOK_STOP, TRIGGER_CLI, TRIGGER_TASK_SHELL]
DEFAULT_TRIGGERS_HUMAN = [TRIGGER_HOOK_BEFORE, TRIGGER_HOOK_STOP, TRIGGER_CLI, TRIGGER_TASK_SHELL]
DEFAULT_TRIGGERS_DOC = [TRIGGER_HOOK_AFTER_EDIT, TRIGGER_HOOK_STOP, TRIGGER_CLI, TRIGGER_TASK_SHELL]
DEFAULT_TRIGGERS_HEAVY = [TRIGGER_HOOK_STOP, TRIGGER_CLI, TRIGGER_TASK_SHELL]

VALID_TRIGGERS = {
    TRIGGER_HOOK_BEFORE,
    TRIGGER_HOOK_AFTER_EDIT,
    TRIGGER_HOOK_STOP,
    TRIGGER_CLI,
    TRIGGER_TASK_SHELL,
}


def normalize_triggers(raw: list[str] | None) -> list[str]:
    if not raw:
        return list(DEFAULT_TRIGGERS_BASE)
    out: list[str] = []
    for t in raw:
        s = str(t).strip()
        if s in VALID_TRIGGERS and s not in out:
            out.append(s)
    return out or list(DEFAULT_TRIGGERS_BASE)


def normalize_scope(raw: list[str] | None) -> list[str]:
    if not raw:
        return []
    return [str(x).strip() for x in raw if str(x).strip()]


def _yaml_list(items: list[str], indent: int = 0) -> str:
    pad = " " * indent
    if not items:
        return f"{pad}[]"
    return "\n".join(f"{pad}- {x}" for x in items)


def _frontmatter(
    check_type: str,
    extra_lines: list[str] | None = None,
) -> str:
    """Lean content: check_type + check-specific fields only (no triggers/scope)."""
    lines = ["---", f"check_type: {check_type}"]
    if extra_lines:
        lines.extend(extra_lines)
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def _pack(
    check_type: str,
    kind: str,
    content: str,
    config: dict[str, Any],
    triggers: list[str],
    scope: list[str],
) -> dict[str, Any]:
    return {
        "check_type": check_type,
        "kind": kind,
        "content": content,
        "config_json": json.dumps(config, ensure_ascii=False),
        "triggers": list(triggers),
        "scope": list(scope),
        "triggers_json": json.dumps(triggers, ensure_ascii=False),
        "scope_json": json.dumps(scope, ensure_ascii=False),
    }


def _rules(
    asset_id: str,
    rules_text: str,
    title: str = "",
    *,
    input_paths: list[str] | None = None,
    triggers: list[str] | None = None,
    scope: list[str] | None = None,
) -> dict[str, Any]:
    """Text rules for Agent prompt injection (not local LLM / file-existence)."""
    _ = (asset_id, title)
    tr = normalize_triggers(triggers if triggers is not None else DEFAULT_TRIGGERS_BASE)
    sc = normalize_scope(scope if scope is not None else [])
    inputs = [str(p).strip() for p in (input_paths or []) if str(p).strip()]
    indented = "\n".join(f"  {line}" if line else "" for line in rules_text.strip().splitlines())
    extra = ["input:", _yaml_list(inputs, 2) if inputs else "  []", "rules_text: |", indented]
    content = _frontmatter("rules", extra_lines=extra)
    return _pack(
        "rules",
        "sensor.rule",
        content,
        {"rules_text": rules_text.strip(), "input": inputs},
        tr,
        sc,
    )


def _file_exists(
    asset_id: str,
    path: str,
    title: str = "",
    *,
    triggers: list[str] | None = None,
    scope: list[str] | None = None,
) -> dict[str, Any]:
    """File-existence gate via inline predicate (replaces old require_files rules)."""
    return _inline(
        asset_id,
        f"file.exists(path={path})",
        title,
        triggers=triggers,
        scope=scope,
    )


def _intent_note(title: str, extra: str = "") -> str:
    """Human-readable Chinese intent after lean frontmatter (does not affect parsers)."""
    title = (title or "").strip()
    extra = (extra or "").strip()
    if not title and not extra:
        return ""
    parts = ["", "## 检查意图", ""]
    if title:
        parts.append(f"{title}。")
        parts.append("")
    if extra:
        parts.append(extra)
        parts.append("")
    parts.append("通过本门禁后再进入下一交付环节。")
    parts.append("")
    return "\n".join(parts)


def _inline(
    asset_id: str,
    expr: str,
    title: str = "",
    extra: str = "",
    *,
    triggers: list[str] | None = None,
    scope: list[str] | None = None,
) -> dict[str, Any]:
    _ = asset_id
    tr = normalize_triggers(triggers if triggers is not None else DEFAULT_TRIGGERS_DOC)
    sc = normalize_scope(scope if scope is not None else [])
    content = _frontmatter("inline", extra_lines=[f'expr: "{expr}"']) + _intent_note(title, extra)
    return _pack("inline", "sensor.rule", content, {"expr": expr}, tr, sc)


def _shell(
    asset_id: str,
    title: str,
    script: str,
    note: str = "",
    *,
    triggers: list[str] | None = None,
    scope: list[str] | None = None,
) -> dict[str, Any]:
    _ = asset_id
    tr = normalize_triggers(triggers if triggers is not None else DEFAULT_TRIGGERS_HEAVY)
    sc = normalize_scope(scope if scope is not None else [])
    body = _frontmatter("shell")
    intent = _intent_note(title, note)
    content = f"""{body}{intent}
```bash
{script.strip()}
```
"""
    return _pack("shell", "sensor.rule", content, {"engine": "shell"}, tr, sc)


def _human(asset_id: str, title: str = "") -> dict[str, Any]:
    tr = list(DEFAULT_TRIGGERS_HUMAN)
    sc: list[str] = []
    label = title or f"人工审批（{asset_id}）"
    content = _frontmatter("human") + _intent_note(
        label,
        "触发时仅提醒「尚未批准」，不执行自动文件/脚本检查；需人工确认后再继续。"
        "须先上传该任务产物，再创建并批准 human-check 工单。",
    )
    return _pack("human", "sensor.human", content, {"approval": True, "reminder_only": True}, tr, sc)


# Resolve active change dir for shell sensors (session / env / latest).
_RESOLVE_CHANGE = r"""
CHANGE="${HX_CHANGE:-${CHANGE:-}}"
if [ -z "$CHANGE" ] && [ -f .nhx/session.json ]; then
  CHANGE=$(python3 -c "import json;print(json.load(open('.nhx/session.json')).get('change') or '')" 2>/dev/null || true)
fi
if [ -z "$CHANGE" ] && [ -d harnessX/changes ]; then
  CHANGE=$(ls -1t harnessX/changes 2>/dev/null | head -1 || true)
fi
if [ -z "$CHANGE" ] && [ -d openspec/changes ]; then
  CHANGE=$(ls -1t openspec/changes 2>/dev/null | head -1 || true)
fi
""".strip()


DEFAULT_SENSOR_SPECS: dict[str, dict[str, Any]] = {
    # ---- req ----
    "req-biz-understanding": _file_exists(
        "req-biz-understanding",
        "docs/requirements/biz-understanding.md",
        "业务理解文档完备",
        scope=["docs/requirements/**"],
    ),
    "req-research-complete": _file_exists(
        "req-research-complete",
        "docs/requirements/research.md",
        "需求调研完备",
        scope=["docs/requirements/**"],
    ),
    "req-analysis-complete": _file_exists(
        "req-analysis-complete",
        "docs/requirements/analysis.md",
        "需求分析完备",
        scope=["docs/requirements/**"],
    ),
    "org-prototype-complete": _file_exists(
        "org-prototype-complete",
        "docs/prototype/README.md",
        "产品原型完备",
        scope=["docs/prototype/**"],
    ),
    "prd-complete": _inline(
        "prd-complete",
        "doc.sections_complete(path=docs/prd/PRD.md, require=[用户故事, 验收标准])",
        "PRD 章节完备",
        scope=["docs/prd/**"],
    ),
    "prd-approved": _human("prd-approved", "PRD 人工审批"),
    # ---- arch ----
    "arch-hld-complete": _inline(
        "arch-hld-complete",
        "doc.sections_complete(path=docs/architecture/hld.md, require=[子系统, 边界])",
        "架构 HLD 章节完备",
        scope=["docs/architecture/**"],
    ),
    "arch-registry-complete": _file_exists(
        "arch-registry-complete",
        "docs/architecture/module-registry.md",
        "模块注册表完备",
        scope=["docs/architecture/**"],
    ),
    "arch-tech-selection-complete": _file_exists(
        "arch-tech-selection-complete",
        "docs/architecture/tech-selection.md",
        "技术选型文档完备",
        scope=["docs/architecture/**"],
    ),
    "arch-database-design-complete": _file_exists(
        "arch-database-design-complete",
        "docs/architecture/database-design.docx",
        "数据库设计完备",
        scope=["docs/architecture/**"],
    ),
    "arch-interface-design-complete": _file_exists(
        "arch-interface-design-complete",
        "docs/architecture/interface-design.md",
        "接口设计完备",
        scope=["docs/architecture/**"],
    ),
    "arch-key-mechanisms-complete": _file_exists(
        "arch-key-mechanisms-complete",
        "docs/architecture/key-mechanisms.md",
        "关键机制设计完备",
        scope=["docs/architecture/**"],
    ),
    "arch-lld-complete": _file_exists(
        "arch-lld-complete",
        "docs/architecture/lld.md",
        "内部接口 / LLD 完备",
        scope=["docs/architecture/**"],
    ),
    "arch-lld-approved": _human("arch-lld-approved", "架构 LLD 人工审批"),
    # ---- dev ----
    "plan-coverage": _file_exists(
        "plan-coverage",
        "docs/dev/plan.md",
        "开发计划完备",
        scope=["docs/dev/**"],
    ),
    "requirements-complete": _shell(
        "requirements-complete",
        "Change 需求/提案完备",
        f"""set -euo pipefail
{_RESOLVE_CHANGE}
ROOT=""
if [ -n "${{CHANGE:-}}" ]; then
  for base in harnessX/changes openspec/changes; do
    if [ -d "$base/$CHANGE" ]; then ROOT="$base/$CHANGE"; break; fi
  done
fi
test -n "$ROOT" || {{ echo "未找到 change 目录（设置 HX_CHANGE 或创建 harnessX/changes/<id>）"; exit 1; }}
test -f "$ROOT/proposal.md" -o -f "$ROOT/requirements.md" -o -f "$ROOT/specs/requirements.md" \\
  || {{ echo "缺少 proposal.md / requirements.md: $ROOT"; exit 1; }}
echo "ok: $ROOT"
""",
    ),
    "spec-validate": _inline(
        "spec-validate",
        "file.exists(path=openspec/config.yaml)",
        "规格配置存在",
        scope=["openspec/**", "harnessX/**"],
    ),
    "design-hld-complete": _shell(
        "design-hld-complete",
        "Change 设计 HLD 完备",
        f"""set -euo pipefail
{_RESOLVE_CHANGE}
ROOT=""
if [ -n "${{CHANGE:-}}" ]; then
  for base in harnessX/changes openspec/changes; do
    if [ -d "$base/$CHANGE" ]; then ROOT="$base/$CHANGE"; break; fi
  done
fi
test -n "$ROOT" || {{ echo "未找到 change 目录"; exit 1; }}
test -f "$ROOT/design.md" -o -f "$ROOT/design/hld.md" -o -f "$ROOT/hld.md" \\
  || {{ echo "缺少 design.md / design/hld.md: $ROOT"; exit 1; }}
""",
    ),
    "design-lld-complete": _shell(
        "design-lld-complete",
        "Change 设计 LLD 完备",
        f"""set -euo pipefail
{_RESOLVE_CHANGE}
ROOT=""
if [ -n "${{CHANGE:-}}" ]; then
  for base in harnessX/changes openspec/changes; do
    if [ -d "$base/$CHANGE" ]; then ROOT="$base/$CHANGE"; break; fi
  done
fi
test -n "$ROOT" || {{ echo "未找到 change 目录"; exit 1; }}
test -f "$ROOT/design/lld.md" -o -f "$ROOT/lld.md" -o -f "$ROOT/design.md" \\
  || {{ echo "缺少 LLD 设计文件: $ROOT"; exit 1; }}
""",
    ),
    "typecheck": _shell(
        "typecheck",
        "类型检查",
        """set -euo pipefail
if [ -f tsconfig.json ]; then
  npx --yes tsc --noEmit
elif [ -f package.json ] && grep -q '"typecheck"' package.json; then
  npm run typecheck
elif [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  python3 -m compileall -q . 2>/dev/null || true
  echo "python: compileall soft-ok"
else
  echo "skip: 未配置 typecheck 入口"; exit 0
fi
""",
    ),
    "lint": _shell(
        "lint",
        "静态检查 / Lint",
        """set -euo pipefail
if [ -f package.json ] && grep -q '"lint"' package.json; then
  npm run lint
elif command -v ruff >/dev/null 2>&1; then
  ruff check .
else
  echo "skip: 未配置 lint 脚本"; exit 0
fi
""",
    ),
    "unit-changed": _shell(
        "unit-changed",
        "单元测试（变更相关）",
        """set -euo pipefail
if [ -f package.json ] && grep -q '"test"' package.json; then
  npm test -- --passWithNoTests 2>/dev/null || npm test
elif command -v pytest >/dev/null 2>&1; then
  pytest -q
else
  echo "skip: 未配置测试运行器"; exit 0
fi
""",
    ),
    "spec-trace": _shell(
        "spec-trace",
        "规格追溯检查",
        f"""set -euo pipefail
{_RESOLVE_CHANGE}
if [ -d openspec ] || [ -d harnessX ]; then
  echo "spec root present"
else
  echo "缺少 openspec/ 或 harnessX/"; exit 1
fi
if [ -n "${{CHANGE:-}}" ]; then
  for base in harnessX/changes openspec/changes; do
    if [ -d "$base/$CHANGE" ]; then
      echo "change: $base/$CHANGE"
      exit 0
    fi
  done
fi
echo "warn: no active change, root ok"
""",
    ),
    "drift": _shell(
        "drift",
        "实现与规格漂移探测（轻量）",
        """set -euo pipefail
if [ ! -d openspec ] && [ ! -d harnessX ] && [ ! -d docs ]; then
  echo "缺少 docs/openspec/harnessX"; exit 1
fi
if [ ! -d src ] && [ ! -d packages ] && [ ! -d app ] && [ ! -d webui ]; then
  echo "缺少常见源码目录（src/packages/app/webui 之一）"; exit 1
fi
echo "drift soft-check ok"
""",
    ),
    "integration-smoke": _shell(
        "integration-smoke",
        "集成冒烟",
        """set -euo pipefail
if [ -f package.json ] && grep -qE '"test:smoke"|"smoke"' package.json; then
  npm run test:smoke 2>/dev/null || npm run smoke
else
  echo "skip: 请在 package.json 配置 test:smoke（或 smoke）脚本"; exit 0
fi
""",
    ),
    # ---- test ----
    "test-cases-complete": _file_exists(
        "test-cases-complete",
        "docs/test/test-cases.md",
        "测试用例文档完备",
        scope=["docs/test/**"],
    ),
    "test-cases-approved": _human("test-cases-approved", "测试用例人工审批"),
    "uat-complete": _file_exists(
        "uat-complete",
        "docs/test/uat-report.md",
        "UAT 报告完备",
        scope=["docs/test/**"],
    ),
    "bugs-closed": _shell(
        "bugs-closed",
        "缺陷关闭确认",
        """set -euo pipefail
FILE="docs/test/bugs.md"
if [ ! -f "$FILE" ]; then
  echo "no bugs.md — treat as closed"; exit 0
fi
if grep -Eiq '^\\s*[-*]\\s*\\[( |open|todo)\\]' "$FILE"; then
  echo "仍有未关闭缺陷条目: $FILE"; exit 1
fi
echo "bugs closed ok"
""",
    ),
    "test-report-complete": _file_exists(
        "test-report-complete",
        "docs/test/test-report.md",
        "测试报告完备",
        scope=["docs/test/**"],
    ),
}


def get_sensor_spec(asset_id: str) -> dict[str, Any] | None:
    return DEFAULT_SENSOR_SPECS.get(asset_id)


def lean_sensor_content(content: str | None) -> str:
    """Remove triggers/scope from content frontmatter (form-only fields)."""
    c = (content or "").replace("\r\n", "\n")
    if not c.strip():
        return c
    m = re.match(r"^---\n([\s\S]*?)\n---(\n[\s\S]*)?$", c)
    if not m:
        return c
    fm = m.group(1)
    fm = re.sub(r"(?m)^triggers:\s*\n(?:[ \t]+-.*\n?)*", "", fm)
    fm = re.sub(r"(?m)^scope:\s*\n(?:[ \t]+(?:-.*|\[\])\s*\n?)*", "", fm)
    fm = re.sub(r"(?m)^triggers:\s*\[[\s\S]*?\]\s*$", "", fm)
    fm = re.sub(r"(?m)^scope:\s*\[[\s\S]*?\]\s*$", "", fm)
    fm = re.sub(r"\n{2,}", "\n", fm).strip("\n")
    rest = (m.group(2) or "").lstrip("\n")
    out = f"---\n{fm}\n---\n{rest}"
    return out.rstrip("\n") + "\n"


def is_placeholder_sensor_content(content: str | None) -> bool:
    """True when content is empty, placeholder, or old verbose help prose to be replaced."""
    c = (content or "").strip()
    if not c:
        return True
    if "Fail-closed rule placeholder" in c:
        return True
    if c.startswith("# Sensor `") and "Fail-closed" in c:
        return True
    if "## 配置说明" in c or "# Sensor 配置说明" in c:
        return True
    if "人工审查关卡" in c and "使用方式" in c:
        return True
    # Legacy file-existence rules (migrated to inline file.exists)
    if "check_type: rules" in c and "require_files:" in c and "rules_text:" not in c:
        return True
    # Legacy: triggers/scope embedded in content (now form-only fields)
    if re.search(r"(?m)^(triggers|scope)\s*:", c):
        return True
    return False
