# /hx-apply — 按任务 Task Pack 实现

你正在执行 **apply** 阶段。按 `tasks.md` 顺序，使用**任务级**上下文（非整包 change）。

## 步骤

对每条未完成任务：

1. 加载：`hx guide task-pack <change> <taskId>`（或读 `tasks/<taskId>-pack.md`）。
   - 服从 **fe-layout**、**design-tokens**、**coding-conventions** 及 `guide.constraint`。
   - 仅实现 `@design=` 指向的 LLD 与 Requirement 片段；优先改 `@files=` 列出的文件。
2. **[test]**：写失败测试，标题含 `Scenario: <精确名称>`。
3. **[impl]**：最小实现；遵守分层（verify 时 arch-boundary 检查）。
4. 每任务后：`hx gate check <change> --phase apply`；读 `fix_hint` 修正，不得弱化测试。
5. 在 tasks.md 标记 `- [x]`。

或：`hx apply <change> --runner "<agent>"` — 每轮设置 `HX_TASK_PACK`。

## 护栏

- 不改 delta spec、meta.yaml、已批准 fixture。

## 完成标准

任务全勾选且 fast 套件全绿，然后 `hx gate advance <change>`。
