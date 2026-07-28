# /hx-req-biz-model-anaysis — 业务模型分析

You are running the **req** stage task `biz-model-anaysis`.

## Input
- Resolve identifiers from the slash-command argument or user message.

## Steps
1. Load the Context Pack for this stage/task.
2. Follow bound Skills / Templates.
3. Produce the deliverable for this task.

## Output
- Task deliverables as defined by bound templates.

## Guardrails
- Do not invent structure when a bound template exists.

## Done when
- Gate check for this stage/task is green.

<!-- harnessx:bound-guides -->

## 特别上下文 / 特别约束（自动注入）

### 特别上下文 — Load context
1. Load the PRD Context Pack for `<slug>`.
2. Read constitution, bound guides, PRD artifacts.

### Bound Skills

| id | kind | source |
|----|------|--------|
| `biz-model-anaysis` | guide.skill | |
| `spec-writing` | guide.skill | |

### Bound Templates

| id | kind | source |
|----|------|--------|
| — | — | — |

### How to use bound guides
- **Skills (2):** Prefer by domain fit; ask user which to prioritize if unclear.

### 特别约束 — Sensors (from suite)

Suite: `req-biz`

| sensor |
|--------|
| `req-biz-understanding` |

### 特别约束 — Gate
Before claiming done: gate check `--stage req --task biz-model-anaysis` — do not finish until green.
