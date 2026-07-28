"""TaskShell assembler — mirrors packages/core/src/taskShell.ts semantics."""

from __future__ import annotations

from app.domain.defaults import slash_name


BOUND_GUIDES_MARKER = "<!-- harnessx:bound-guides -->"


def pack_load_step(stage: str, task: str) -> str:
    if stage == "dev" and task == "apply":
        return (
            "### 特别上下文 — 加载上下文\n"
            "1. 对每个未完成任务：加载该变更的任务包。\n"
            "2. 然后遵循下方绑定的 Skill（及 Template，如有）。\n"
            "从参数或用户消息中解析 `<change>` / `<taskId>`。"
        )
    if stage == "req":
        return (
            "### 特别上下文 — 加载上下文\n"
            "1. 加载 `<slug>` 的 PRD Context Pack。\n"
            "2. 阅读章程、绑定 Guide 与 PRD 产物。"
        )
    if stage == "arch":
        return (
            "### 特别上下文 — 加载上下文\n"
            "1. 加载架构 Context Pack（LLD 时补充模块上下文）。\n"
            "2. 阅读章程、绑定 Guide 与架构产物。"
        )
    return (
        f"### 特别上下文 — 加载上下文\n"
        f"1. 加载阶段 `{stage}` 任务 `{task}` 的 Context Pack。\n"
        "2. 阅读章程、绑定 Guide 与变更产物。"
    )


def gate_reminder(stage: str, task: str) -> str:
    if stage in ("dev", "test"):
        return (
            "### 特别约束 — 门禁\n"
            f"宣称完成前：执行 gate check `<change> --stage {stage} --task {task}`，未通过不得结束。"
        )
    if stage == "req":
        return (
            "### 特别约束 — 门禁\n"
            f"宣称完成前：执行 gate check `--stage req --task {task}`，未通过不得结束。"
        )
    return (
        "### 特别约束 — 门禁\n"
        f"宣称完成前：执行 arch check `--task {task}`，未通过不得结束。"
    )


def assemble_appendix(
    stage: str,
    task: str,
    guides: list[str],
    templates: list[str],
    sensors: list[str],
) -> str:
    skill_rows = "\n".join(f"| `{g}` | guide.skill | |" for g in guides) or "| — | — | — |"
    tpl_rows = "\n".join(f"| `{t}` | guide.template | |" for t in templates) or "| — | — | — |"
    sensor_rows = "\n".join(f"| `{s}` |" for s in sensors) or "| — |"

    selection = ["### 如何使用绑定 Guide"]
    if len(guides) == 1:
        selection.append(f"- **Skill：** 遵循 `{guides[0]}`。")
    elif len(guides) > 1:
        selection.append(
            f"- **Skills（{len(guides)}）：** 按领域匹配优先；不明确时询问用户优先级。"
        )
    else:
        selection.append("- 未绑定 Skill 资产。")
    if len(templates) == 1:
        selection.append(f"- **Template：** 使用 `{templates[0]}` 组织交付物结构。")
    elif len(templates) > 1:
        selection.append(
            f"- **Templates（{len(templates)}）：** 通常选用 **一种** 产出形态；不明确时询问用户。"
        )

    sections = [
        BOUND_GUIDES_MARKER,
        "",
        "## 特别上下文 / 特别约束（自动注入）",
        "",
        pack_load_step(stage, task),
        "",
        "### 绑定 Skills",
        "",
        "| id | kind | source |",
        "|----|------|--------|",
        skill_rows,
        "",
        "### 绑定 Templates",
        "",
        "| id | kind | source |",
        "|----|------|--------|",
        tpl_rows,
        "",
        "\n".join(selection),
        "",
        "### 特别约束 — 绑定 Sensors",
        "",
        "| sensor |",
        "|--------|",
        sensor_rows,
        "",
        gate_reminder(stage, task),
        "",
    ]
    return "\n".join(sections)


def assemble_shell(
    stage: str,
    task: str,
    description: str,
    body: str,
    guides: list[str],
    templates: list[str],
    sensors: list[str],
) -> dict[str, str]:
    appendix = assemble_appendix(stage, task, guides, templates, sensors)
    return {
        "slash_name": slash_name(stage, task),
        "description": description,
        "body": body.strip(),
        "appendix": appendix,
        "full": body.strip() + "\n\n" + appendix,
    }
