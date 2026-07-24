# /hx-req-requirements-analysis — 需求分析

你正在执行 **req** 阶段任务 `requirements-analysis`。

## Input
- PRD slug；可用的调研笔记。

## Steps
1. 缺失时先建目录：`hx req analysis init <slug>`。
2. 通过 req 命令/技能撰写 `docs/prd/<slug>/analysis.md`。
3. `hx req check --task requirements-analysis --prd <slug>`。

## Output
- 组织级分析 sidecar。

## Guardrails
- 仅组织级；不创建 change、不实现代码。

## Done when
`hx req check --task requirements-analysis --prd <slug>` 绿灯。
