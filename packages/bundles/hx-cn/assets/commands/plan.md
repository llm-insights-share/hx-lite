# /hx-plan — 双轨任务与设计交接

你正在执行 **plan** 阶段。产出带 `@design=`、`@files=` 的 `tasks.md`，并同步 `delivery-trace.yaml`。

## 步骤

1. `hx plan <change>` — 从 delta spec 生成双轨任务及交接注解。
2. 审阅 `tasks.md`：排序、拆分大任务、补充 `@group=`。
3. 确保 impl 任务的 `@design=` 指向 `design/` 下 LLD 文件。
4. 将 `@files=` 细化为仓库真实路径。
5. `hx gate check <change> --phase plan`（enterprise：plan-coverage）。
6. `hx gate advance <change>`。

## 护栏

- 不得删除 `[test]` 任务；Scenario 名字面量匹配 traceability。

## 完成标准

`tasks.md` 完整且含设计交接，plan 门禁通过。
