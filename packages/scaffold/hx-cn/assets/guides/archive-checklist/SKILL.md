# 归档检查清单

rebase →（必要时）promote → archive → 审阅 retro。

## 何时使用
- 任务 `dev.archive`

## 步骤
1. `hx rebase check <change>`
2. 企业版需要时 `hx arch promote <change>`
3. `hx archive <change>`
4. 审阅 `retro.md` 并单独提交归档

## 规则
- 勿手改主规格；冲突在 delta 侧解决

## 完成条件
change 已进入 `harnessX/archive/`
