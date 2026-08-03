"""TaskShell assembler — mirrors packages/core/src/taskShell.ts semantics."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from app.domain.defaults import slash_name


BOUND_GUIDES_MARKER = "<!-- harnessx:bound-guides -->"
GUIDE_INPUTS_START = "<!-- harnessx:guide-inputs -->"
GUIDE_INPUTS_END = "<!-- /harnessx:guide-inputs -->"
INPUT_HEADINGS = ("输入", "Input", "参数")


def _debug_log(run_id: str, hypothesis_id: str, location: str, message: str, data: dict) -> None:
    # region agent log
    try:
        payload = {
            "sessionId": "0fdc83",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        Path("/Users/zhangjr/apps/LlmDemo/hx-project/hx-lite/.cursor/debug-0fdc83.log").open(
            "a", encoding="utf-8"
        ).write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
    # endregion


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
    return (
        "### 特别约束 — 门禁\n"
        f"宣称完成前：执行 `nhx check --stage {stage} --task {task}`，"
        "未通过不得结束（本地无独立 `gate` 命令，请使用 nhx check）。"
    )


def assemble_appendix(
    stage: str,
    task: str,
    guides: list[str],
    templates: list[str],
    sensors: list[str],
    other_guides: list[tuple[str, str]] | None = None,
) -> str:
    other_guides = other_guides or []
    skill_rows = "\n".join(f"| `{g}` | guide.skill | |" for g in guides) or "| — | — | — |"
    tpl_rows = "\n".join(f"| `{t}` | guide.template | |" for t in templates) or "| — | — | — |"
    other_rows = (
        "\n".join(f"| `{gid}` | `{kind}` | |" for gid, kind in other_guides) or "| — | — | — |"
    )
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
    if len(other_guides) == 1:
        gid, kind = other_guides[0]
        selection.append(f"- **其它 Guide（`{kind}`）：** 遵循 `{gid}`。")
    elif len(other_guides) > 1:
        selection.append(
            f"- **其它 Guides（{len(other_guides)}）：** 按 kind 适用约束/范例/脚手架等；不明确时询问用户。"
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
        "### 其它 Guides",
        "",
        "| id | kind | source |",
        "|----|------|--------|",
        other_rows,
        "",
        "\n".join(selection),
        "",
        "### 特别约束 — 绑定 Checks",
        "",
        "| check |",
        "|--------|",
        sensor_rows,
        "",
        gate_reminder(stage, task),
        "",
    ]
    return "\n".join(sections)


def extract_input_section(md: str) -> str:
    text = (md or "").strip()
    if not text:
        return ""
    for heading in INPUT_HEADINGS:
        m = re.search(rf"(?im)^##\s+{re.escape(heading)}\s*$", text)
        if not m:
            continue
        rest = text[m.end() :]
        nxt = re.search(r"(?im)^##\s+", rest)
        sec = (rest[: nxt.start()] if nxt else rest).strip()
        if sec:
            return sec
    return ""


def build_guide_inputs_block(items: list[tuple[str, str]]) -> str:
    sections: list[str] = []
    for gid, content in items:
        sec = extract_input_section(content)
        # region agent log
        _debug_log(
            "run-wording-pre-fix",
            "H3",
            "shell_assembler.py:build_guide_inputs_block",
            "guide_input_section_extracted",
            {
                "guide_id": gid,
                "has_section": bool(sec),
                "first_line": (sec.splitlines()[0] if sec else ""),
            },
        )
        # endregion
        if not sec:
            continue
        sections.extend([f"### 来自 `{gid}`", sec, ""])
    if not sections:
        return ""
    return "\n".join([GUIDE_INPUTS_START, *sections, GUIDE_INPUTS_END]).strip()


def _replace_marker_block(text: str, replacement: str) -> str:
    # region agent log
    _debug_log(
        "run-pre-fix",
        "H1",
        "shell_assembler.py:_replace_marker_block",
        "marker_count_before_replace",
        {
            "start_count": text.count(GUIDE_INPUTS_START),
            "end_count": text.count(GUIDE_INPUTS_END),
            "has_replacement": bool(replacement),
        },
    )
    # endregion
    pattern = re.compile(
        rf"(?s)\n?{re.escape(GUIDE_INPUTS_START)}.*?{re.escape(GUIDE_INPUTS_END)}\n?"
    )
    stripped = pattern.sub("\n", text).strip() + "\n"
    if not replacement:
        return stripped
    return stripped


def inject_guide_inputs(body: str, block: str) -> str:
    text = (body or "").strip() + "\n"
    # region agent log
    _debug_log(
        "run-pre-fix",
        "H2",
        "shell_assembler.py:inject_guide_inputs",
        "inject_entry",
        {
            "body_start_count": text.count(GUIDE_INPUTS_START),
            "body_end_count": text.count(GUIDE_INPUTS_END),
            "block_nonempty": bool(block),
        },
    )
    # endregion
    text = _replace_marker_block(text, "")
    if not block:
        return text.strip()

    m = re.search(r"(?im)^##\s+输入\s*$", text)
    if m:
        insert_pos = m.end()
        rest = text[insert_pos:]
        nxt = re.search(r"(?im)^##\s+", rest)
        if nxt:
            section_end = insert_pos + nxt.start()
            section_body = text[insert_pos:section_end].rstrip()
            text = f"{text[:insert_pos]}{section_body}\n\n{block}\n\n{text[section_end:].lstrip()}"
        else:
            section_body = text[insert_pos:].rstrip()
            text = f"{text[:insert_pos]}{section_body}\n\n{block}\n"
        return text.strip()

    step_match = re.search(r"(?im)^##\s+步骤\s*$", text)
    input_section = f"## 输入\n- 从绑定 Guide 输入段自动注入（如下）。\n\n{block}\n\n"
    if step_match:
        return f"{text[:step_match.start()]}{input_section}{text[step_match.start():]}".strip()
    return f"{text.rstrip()}\n\n{input_section}".strip()


def assemble_shell(
    stage: str,
    task: str,
    description: str,
    body: str,
    guides: list[str],
    templates: list[str],
    sensors: list[str],
    guide_contents: dict[str, str] | None = None,
    other_guides: list[tuple[str, str]] | None = None,
) -> dict[str, str]:
    guide_contents = guide_contents or {}
    other_guides = other_guides or []
    # region agent log
    _debug_log(
        "run-pre-fix",
        "H3",
        "shell_assembler.py:assemble_shell",
        "assemble_entry",
        {
            "stage": stage,
            "task": task,
            "guides_len": len(guides),
            "guides_unique_len": len(set(guides)),
            "other_guides_len": len(other_guides),
            "guide_contents_len": len(guide_contents),
            "body_start_count": (body or "").count(GUIDE_INPUTS_START),
        },
    )
    # endregion
    inject_ids = list(guides) + [gid for gid, _ in other_guides]
    ordered = [(gid, guide_contents.get(gid, "")) for gid in inject_ids if gid in guide_contents]
    block = build_guide_inputs_block(ordered)
    body_with_inputs = inject_guide_inputs(body, block)
    appendix = assemble_appendix(stage, task, guides, templates, sensors, other_guides=other_guides)
    return {
        "slash_name": slash_name(stage, task),
        "description": description,
        "body": body_with_inputs.strip(),
        "appendix": appendix,
        "full": body_with_inputs.strip() + "\n\n" + appendix,
    }
