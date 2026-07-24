# /hx-test-test-case-design — 测试用例设计

你正在执行 **test** 阶段任务 `test-case-design`。

## Input
- change id；规格与设计。

## Steps
1. 缺失时先建目录：`hx test-cases init <change>`，再通过 test-case-design 命令/技能撰写 `test-cases/overview.md`。
2. `hx gate check <change> --stage test --task test-case-design`。
3. 需要时人工批准。

## Output
- 测试用例产物。

## Guardrails
- 本任务不写功能实现代码。

## Done when
test-case-design 门禁绿灯（及所需批准）。
