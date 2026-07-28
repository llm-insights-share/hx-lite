# /hx-req-requirements-research — 需求调研

你正在执行 **req** 阶段任务 `requirements-research`。

## Input
- PRD slug 与调研材料。

## Steps
1. 缺失时先建目录：`hx req research init <slug>`。
2. 通过 req 命令/技能撰写 `docs/prd/<slug>/research.md`。
3. 遵循已绑定 Skill。
4. `hx req check --task requirements-research --prd <slug>`。

## Output
- 组织级调研 sidecar。

## Guardrails
- 仅组织级；不做 change 级 explore，不写代码。

## Done when
`hx req check --task requirements-research --prd <slug>` 绿灯。
