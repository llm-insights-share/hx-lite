# HarnessX 使用场景示例

本目录收录一组贴近实际工作的端到端场景。每个场景包含：**背景与角色**、**逐步操作命令与期望输出**、**关键机制解析**。命令输出均与 `hx` CLI 实际行为一致，可以照着在真实仓库中复现。

| # | 场景 | 主要覆盖能力 |
| --- | --- | --- |
| [01](01-新项目接入.md) | 新的后端 API 项目接入 HarnessX | `init --bundle` / hooks / CI 重放 / adapter 编译 |
| [02](02-标准功能开发全流程.md) | 订单服务新增"部分退款"功能（standard profile） | propose→design→spec→人工批准→plan→apply 自校正→verify→archive |
| [03](03-核心域改动-strict-测试先行.md) | 支付核心域改动，strict profile + 测试先行 | profile 推荐 / testfirst / 已批准断言保护 / waiver |
| [04](04-并发变更冲突.md) | 两个团队同时修改同一 capability | 域重叠告警 / rebase check / 冲突解决 |
| [05](05-紧急修复-lite.md) | 线上 bug 紧急修复走 lite 快速通道 | profile 降级记录 / `archive --force` / 事后补账 |
| [06](06-遗留项目迁移-openspec.md) | 存量 OpenSpec 项目迁移 + 遗留代码补 spec | `openspec import` / `sync` 漂移检测 / 回写规格 |
| [07](07-steering-质量治理.md) | AI 交付质量治理：从重复失败到规则沉淀 | 失败目录 / `steer distill` / rubric 生命周期 / janitor |
| [08](08-hub-资产共享与供应链.md) | 平台团队通过 Hub 向业务仓库分发规范资产 | hub promote/review/add/sync / lock / 注入扫描 |
| [09](09-多工具协作与CI强制.md) | 团队成员分别使用 Cursor/Trae/Qoder/Claude Code | adapter 单源编译 / 手改漂移检测 / Quest 导出 / 绕过 hooks 被 CI 拦截 |
| [10](10-自定义传感器与触发器.md) | 安全团队接入自研扫描器 + 事件/定时触发 | 插件 API（Node/命令协议）/ file-save 触发 / schedule / `hx fix` |

## 阅读前提

- 已按仓库根目录 `README.md` 完成 `npm install`；示例中以 `hx` 代指 `node bin/hx.js`（或全局安装后的 `hx`）。
- 示例中的人名（王工、李工、张架构师等）与业务（订单、支付、库存）均为虚构，用于说明角色分工：**谁写规格、谁批准、谁实现、谁审核**。

## 核心心智模型（1 分钟版）

1. 一切行为改动都在 **change 工作区**（`harnessX/changes/<id>/`）内进行，通过 delta spec 描述"规格的增量"。
2. 阶段推进靠 **Gate**：`hx gate advance` 只在该阶段 Sensor 套件全绿、且满足前置条件（如人工批准）时才放行；Sensor 崩溃视为阻断（fail-closed）。
3. AI agent 的输入由 **Guide/Context Pack** 组装（`hx guide pack`），输出由 **Sensor** 检验；失败报告带 `fix_hint`/`fix_command`，可直接进入修复回环（`hx fix`）。
4. 交付完成后 `hx archive` 把 delta 合并进主规格，主规格永远是"当前系统行为"的唯一事实源。
5. 反复出现的失败通过 **Steering** 蒸馏成新的 Guide/Rubric 资产，经 trial 验证后晋级 enforced，再经 **Hub** 共享到其他仓库——harness 自身持续进化。
