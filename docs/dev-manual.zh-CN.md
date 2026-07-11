# 开发人员应用交付使用手册

**适用角色**：后端开发、前端开发、全栈开发、测试开发、技术负责人（TL）  
**适用阶段**：`dev`（开发阶段，change 级）；衔接 `test` 收口与 `archive`  
**版本**：HarnessX v0.6+  
**关联文档**：[操作说明 §6 开发阶段](operation-guide.zh-CN.md) · [交付阶段权威定义](delivery-stages.zh-CN.md) · [场景 02 标准功能](examples/02-标准功能开发全流程.md) · [场景 14 全栈多角色](examples/14-企业全栈多角色交付.md) · [产品经理手册](pm-req-manual.zh-CN.md) · [架构师手册](arch-hld-manual.zh-CN.md)

---

## 1. 概述与定位

本手册说明开发人员如何使用 HarnessX 完成**从 change 创建到代码交付、验证与归档**的完整流程，并覆盖**多人协同**（前后端、多子系统、并发 change）场景。

HarnessX 将交付拆为组织级真相源与 change 级增量：

| 层级 | 路径 | 维护者 | 生命周期 |
| --- | --- | --- | --- |
| **组织级 PRD** | `docs/prd/<slug>.md` | 产品经理 | 跨多个 change |
| **组织级架构** | `docs/architecture/` | 架构师 | 跨多个 change |
| **change 工作区** | `harnessX/changes/<id>/` | 研发 | 单次功能交付 |
| **主规格（合并后）** | `harnessX/specs/<capability>/spec.md` | 研发（archive 写入） | 长期真相源 |

**操作分工原则**：

| 入口 | 适用操作 | 示例 |
| --- | --- | --- |
| **IDE（Cursor 等）** | 写提案、设计、规格、代码、自校正 | `/hx-dev-propose`、`/hx-dev-apply` |
| **终端 CLI** | 门禁推进、人工批准、plan/apply/verify、归档 | `hx gate approve`、`hx archive` |

> 经验法则：**Agent 能自己完成的走 IDE；必须人背书的走终端。**

---

## 2. 核心概念

### 2.1 dev 阶段任务

| 任务 ID | 必选 | 说明 | 典型 CLI / IDE |
| --- | --- | --- | --- |
| `propose` | 是 | 提案 + delta spec | `hx propose` · `/hx-dev-propose` |
| `design` | 是 | change 级设计包 | `hx design` · `/hx-dev-design` |
| `plan` | 是 | 双轨 `tasks.md` | `hx plan` · `/hx-dev-plan` |
| `apply` | 是 | 逐任务实现 | `hx apply` · `/hx-dev-apply` |
| `verify` | 是 | 全量验证 + 可追溯 | `hx verify` · `/hx-dev-verify` |
| `archive` | 是 | 合并 delta、归档 change | `hx archive` · `/hx-dev-archive` |

**人工批准门**：`design → plan` 须终端执行 `hx gate approve <change> --gate design-to-plan --approver <name>`（绑定 artifact hash）。

### 2.2 change 工作区结构

```text
harnessX/changes/<id>/
├── meta.yaml           # stage/task、批准记录、域声明
├── proposal.md         # 提案（Why / What / Impact）
├── specs/<cap>/spec.md # delta spec（EARS + Scenario）
├── design/             # change 级设计（HLD/LLD/UI/API）
├── tasks.md            # 双轨任务：[test] + [impl]
├── requirements/       # enterprise：PRD 蒸馏
└── traces/             # 交付追溯
```

### 2.3 门禁与传感器（dev 常用）

| 传感器 / 门 | 触发时机 | 含义 |
| --- | --- | --- |
| `spec-validate` | dev `propose` / `verify` | delta spec 格式与完整性 |
| `spec-trace` | dev `verify` | Scenario 与测试字面映射 |
| `design-hld-complete` | dev `design` | change 设计包完整 |
| `plan-coverage` | dev `plan` | 每个 Requirement 有双轨任务 |
| `arch-boundary` | dev `apply` / `verify` | 分层架构约束（Bundle 相关） |
| `design-to-plan` | `gate advance`（plan 前） | 须人工批准 |

enterprise 额外：`prd-complete`、`prd-approved`、`arch-approved`、`arch-change-align`、`arch-drift` 等（见 [架构师手册](arch-hld-manual.zh-CN.md)）。

### 2.4 Profile 与 dev 任务差异

| Profile | dev 任务序列 | 适用 |
| --- | --- | --- |
| `lite` | `propose → apply → archive` | 紧急 hotfix |
| `standard` | `propose → design → plan → apply → verify → archive` | 日常功能 |
| `strict` | 同 standard + 更严 verify | 支付/核心域 |
| `enterprise` | 同 standard + org PRD/arch 注入与 `hx arch promote` | 企业多角色 |
| `enterprise-sdlc` | 四阶段 + 工单 + test 全量任务 | 正式 SDLC |

本手册默认 **`standard`**；企业/全栈场景见 §6、§7。

---

## 3. 环境与前置条件

### 3.1 环境准备

```bash
cd <your-repo>
# hx 指 node bin/hx.js 或全局安装后的 hx 命令
hx --help
```

### 3.2 项目已初始化

技术负责人通常已完成；开发需确认：

```bash
ls harnessX/config.yaml harnessX/harness.yaml
hx adapter sync --targets cursor    # 生成 .cursor/commands、skills、hooks
```

未执行 `adapter sync` 时，Cursor 中**没有**斜杠命令。

### 3.3 斜杠命令命名

`hx adapter sync` 后，命令文件位于 `.cursor/commands/`，正式名为 **`hx-{stage}-{task}`**：

| 文档/场景简写 | adapter 实际命令 | dev 任务 |
| --- | --- | --- |
| `/hx-propose` | `/hx-dev-propose` | `propose` |
| `/hx-design` | `/hx-dev-design` | `design` |
| `/hx-plan` | `/hx-dev-plan` | `plan` |
| `/hx-apply` | `/hx-dev-apply` | `apply` |
| `/hx-verify` | `/hx-dev-verify` | `verify` |
| `/hx-archive` | `/hx-dev-archive` | `archive` |

> 以仓库 `.cursor/commands/` 下实际文件名为准。

---

## 4. 一次性接入（技术负责人，全员知晓）

### 4.1 单后端服务（一个子系统一个仓库）

```bash
cd orders-api
hx init --bundle api-service
# 或：hx init --from-hub api-service@1.0.0 --hub <hub路径>
# 编辑 harnessX/constitution.md
hx harness lint
hx hooks install && hx ci init
hx adapter sync --targets cursor
hx lock write    # 若接入 Hub
```

### 4.2 完整产品 Monorepo（API + 多前端）

```bash
cd retailco-monorepo
hx init --bundle api-service
hx bundle add frontend-dashboard    # B 端后台
hx bundle add frontend-2c           # C 端门户
hx adapter sync
hx hooks install && hx ci init
```

各 app 目录（如 `apps/api/`、`apps/admin-web/`）遵守对应 Bundle 的分层与传感器约束。

### 4.3 多仓库、多子系统（各团队独立仓库）

```bash
# 各子系统仓库（member-api、portal-web 等）
hx init --from-hub api-service@1.0.0 --hub <hub路径>
hx hub add coding-conventions@1.0.0 --hub <hub路径>
hx lock write && hx adapter sync
```

组织规范由中央 Hub 下发；本地定制走 `harness.yaml` 的 `overrides` + `hx hub sync --apply`。

---

## 5. 单人开发：标准功能全流程

适用：一名开发负责一个 change，`standard` profile。完整 walkthrough：[场景 02](examples/02-标准功能开发全流程.md)。

### 5.1 创建 change

```bash
hx change create partial-refund --domains order-refund
```

### 5.2 Propose — 提案与 delta spec

**IDE：**

```text
/hx-dev-propose partial-refund
需求：支持部分退款。一笔订单可多次退款，累计不得超过实付金额。
产品文档见 @docs/prd/partial-refund.md
```

**终端：**

```bash
hx propose partial-refund --title "支持部分退款"
hx gate check partial-refund --stage dev --task propose
hx gate advance partial-refund          # propose 完成 → design
```

### 5.3 Design — change 级设计

```text
/hx-dev-design partial-refund
```

```bash
hx design partial-refund
hx gate check partial-refund --stage dev --task design
hx gate advance partial-refund
```

### 5.4 人工批准（架构师 / TL）

```bash
hx gate approve partial-refund --gate design-to-plan --approver zhang.arch
```

### 5.5 Plan — 双轨任务

```bash
hx plan partial-refund
hx gate advance partial-refund          # → apply
```

`tasks.md` 示例：

```markdown
- [ ] 01a [test] (order-refund / Requirement: 部分退款) Write failing test(s)...
- [ ] 01b [impl] (order-refund / Requirement: 部分退款) Implement until tests pass
```

### 5.6 Apply — 实现

**IDE（推荐日常）：**

```text
/hx-dev-apply partial-refund
```

**终端 headless：**

```bash
hx apply partial-refund --runner 'cursor-agent ...'
hx apply partial-refund --parallel 2 --runner '<agent>'   # 独立任务并行
```

测试命名须字面包含 `Scenario:` 原文：

```typescript
it("Scenario: refund exceeding paid amount rejected", async () => { ... });
```

### 5.7 Verify → Archive

```bash
hx verify partial-refund
hx trace check partial-refund
hx archive partial-refund
```

```text
/hx-dev-verify partial-refund
```

---

## 6. 完整产品 + 多人协同（前后端 + 多子系统）

适用：同一 Monorepo 交付 API + 多个前端，多人分工。完整 walkthrough：[场景 14](examples/14-企业全栈多角色交付.md)。

### 6.1 角色与入口

| 角色 | 职责 | 常用入口 |
| --- | --- | --- |
| 产品经理 | 需求边界、proposal、delta spec 定稿 | `/hx-dev-propose` |
| 设计 | 交互、API 清单、ADR | `/hx-dev-design` |
| 后端开发 | `apps/api/` 实现与 API 测试 | `/hx-dev-apply`（`@group=be-*`） |
| 前端开发 | `apps/admin-web/`、`apps/portal-web/` | `/hx-dev-apply`（`@group=fe-*`） |
| 测试 | Scenario 评审、traceability、verify | `hx testfirst approve`；`/hx-dev-verify` |

### 6.2 单 change 时间线（示例 `member-points`）

```bash
# 0. 创建（产品主导）
hx change create member-points --domains member,points

# 1–3. propose / design / spec 定稿 — IDE 驱动，终端推进
hx gate check member-points --stage dev --task propose
hx gate advance member-points

# 4. 人工批准
hx gate approve member-points --gate design-to-plan --approver chen.pm

# 5. plan（后端主导）
hx plan member-points
hx gate advance member-points

# 6. apply（前后端并行）
hx apply member-points --parallel 2 --runner '<agent>'

# 7. verify（测试收口）
hx verify member-points
hx trace check member-points

# 8. archive
hx archive member-points
```

### 6.3 前后端并行：`@group` / `@depends`

`tasks.md` 片段：

```markdown
- [ ] 01a [test] (...) API balance tests @group=be-tests
- [ ] 03a [test] (...) Portal E2E @group=fe-portal-tests
- [ ] 01b [impl] (...) Implement balance API @depends=01a @group=be-impl
- [ ] 03b [impl] (...) Portal page @depends=03a @group=fe-impl
```

**后端（独立 Cursor 会话）：**

```text
/hx-dev-apply member-points
只执行 @group=be-tests 与 @group=be-impl；代码仅限 apps/api/
```

**前端（另一会话，同时进行）：**

```text
/hx-dev-apply member-points
执行 fe-portal-tests / fe-admin-tests 及对应 impl；
apps/admin-web 遵守 dashboard 分层；apps/portal-web 遵守 2C SEO 约束。
```

### 6.4 协作要点

1. **单 change、双端代码**：delta spec 按 **capability** 拆分，避免前端无规格。
2. **Bundle 各管各层**：API 用 `api-service`；各前端用对应 bundle 的 `arch-boundary`。
3. **规格单源**：`meta.yaml` 与 delta spec 全团队共用；禁止各自 fork 规格。
4. **测试前置**：测试在 propose 阶段介入 Scenario，plan 阶段守住 `[test]` 任务，verify 用 `hx trace check` 收口。

---

## 7. 多团队 / 多子系统并行与冲突

### 7.1 域重叠告警（不阻断）

```bash
hx change create reservation-ttl --domains stock-reservation
hx change create bulk-reserve --domains stock-reservation,api-gateway
# WARNING: overlaps with active change "reservation-ttl" on domains: stock-reservation
```

创建时对齐：各自改哪些 Requirement、谁先 `archive`。详见 [场景 04](examples/04-并发变更冲突.md)。

### 7.2 archive 前 rebase 检查

```bash
hx rebase check bulk-reserve
```

若冲突，在 IDE 中基于**当前主规格**重写 delta：

```text
/hx-dev-propose bulk-reserve
请根据 harnessX/specs/stock-reservation/spec.md（已含 TTL 语义）
重写 MODIFIED Requirements，在 TTL 之上叠加批量语义。
```

### 7.3 CODEOWNERS 建议

- `harnessX/specs/**` — 规格 owner
- `harnessX/changes/**/specs/**` — change delta owner
- 各 `apps/<subsystem>/` — 子系统 owner

---

## 8. 企业级：衔接组织 PRD 与架构

enterprise change 须先完成组织级 req/arch（[场景 19](examples/19-组织级PRD与架构设计.md)），再进入 dev。

### 8.1 创建 change（自动注入 org 上下文）

```bash
hx change create member-badge \
  --domains member \
  --profile enterprise \
  --prd member-badge \
  --arch-modules member
```

`hx guide pack member-badge --stage dev --task propose` 输出的 Context Pack 已含 org PRD 与模块 LLD。

### 8.2 dev 流程差异

- `hx gate check --stage dev --task propose` 含 `prd-complete`、`prd-approved`
- `hx gate check --stage dev --task design` 含 `arch-approved`、`arch-change-align`
- **archive 前**须 `hx arch promote member-badge --by lin.arch`（将 change design 沉淀回模块 LLD）

完整交接 walkthrough：[场景 15](examples/15-企业级需求到交付交接.md)。

### 8.3 单任务编码交接（enterprise）

`tasks.md` 可用 `@design=`、`@files=` 标注上下文；终端导出单任务包：

```bash
hx guide task-pack member-badge 01b
# 注入 HX_TASK_PACK 供 apply runner 使用
```

---

## 9. IDE 斜杠命令与绑定 Skill

### 9.1 dev 阶段命令

| adapter 命令 | 绑定任务 | 用途 |
| --- | --- | --- |
| `/hx-dev-propose <change>` | `propose` | 提案 + delta spec + requirements |
| `/hx-dev-design <change>` | `design` | change 级设计包 |
| `/hx-dev-plan <change>` | `plan` | 复核/调整 tasks.md |
| `/hx-dev-apply <change>` | `apply` | 逐任务实现 + fast 套件自校正 |
| `/hx-dev-verify <change>` | `verify` | 全量验证 + 补测指引 |
| `/hx-dev-archive <change>` | `archive` | 归档指引（实际 archive 走终端） |

### 9.2 常用绑定 Skill（apply / propose 自动挂载）

| Skill | 绑定任务 | 要点 |
| --- | --- | --- |
| `spec-writing` | `propose` | EARS 句式、Scenario 命名 |
| `coding-conventions` | `apply` | 项目编码规范 |
| `api-design` | `design` / `apply` | API 分层（api-service bundle） |
| `ui-architecture` | `design` / `apply` | 前端分层（dashboard / 2c bundle） |

Skill 源文件在 `harnessX/assets/`；**勿手改** `.cursor/skills/` 生成文件，改后须 `hx adapter sync`。

---

## 10. 终端 CLI 速查

### 10.1 change 与状态

| 命令 | 说明 |
| --- | --- |
| `hx change create <id> --domains <list>` | 创建 change |
| `hx change list` | 活跃 change 及 stage/task |
| `hx dev status <change>` | dev 任务进度 |
| `hx stage status --stage dev <change>` | 同上（按阶段） |

### 10.2 dev 任务

| 命令 | 说明 |
| --- | --- |
| `hx propose <change> --title "..."` | 提案脚手架 |
| `hx design <change>` | 设计脚手架 |
| `hx plan <change>` | 生成 tasks.md |
| `hx apply <change> [--parallel N] [--runner '<cmd>']` | 逐任务执行 |
| `hx verify <change>` | 全量验证 |
| `hx archive <change>` | 合并 delta 并归档 |

### 10.3 门禁与质量

| 命令 | 说明 |
| --- | --- |
| `hx gate check <change> --stage dev --task <task>` | 任务门禁 |
| `hx gate advance <change>` | 推进至下一任务 |
| `hx gate approve <change> --gate design-to-plan --approver <name>` | 人工批准 |
| `hx trace check <change>` | Scenario 可追溯 |
| `hx rebase check <change>` | archive 前 delta 与主规格对齐 |
| `hx fix --change <id> --sensor lint --runner '<cmd>'` | 聚焦修复会话 |
| `hx testfirst approve <change> --files ... --by <name>` | 批准测试桩（strict） |

### 10.4 上下文与适配器

| 命令 | 说明 |
| --- | --- |
| `hx guide pack <change> --stage dev --task <task> --out <file>` | 阶段 Context Pack |
| `hx guide task-pack <change> <taskId>` | 单任务交接包 |
| `hx adapter sync [--targets cursor,...]` | 编译 IDE 资产 |
| `hx adapter drift` | 检测手改生成文件 |

完整选项见 [操作说明 §6](operation-guide.zh-CN.md)。

---

## 11. 日常最小操作集

**单人 standard 功能：**

```bash
hx change create <id> --domains <d1,d2>
# Cursor: /hx-dev-propose <id>
hx gate check <id> --stage dev --task propose && hx gate advance <id>
# Cursor: /hx-dev-design <id>
hx gate approve <id> --gate design-to-plan --approver <name>
hx plan <id> && hx gate advance <id>
# Cursor: /hx-dev-apply <id>
hx verify <id> && hx trace check <id>
hx archive <id>
```

**全栈多人（在 §11 基础上）：**

- plan 后 `tasks.md` 用 `@group` 拆分前后端
- 各角色独立 Cursor 会话执行 `/hx-dev-apply`
- 或终端 `hx apply <id> --parallel 2 --runner '<agent>'`

---

## 12. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Cursor 里没有 `/hx-propose` | 未 adapter sync | `hx adapter sync --targets cursor`；实际名可能为 `/hx-dev-propose` |
| `gate advance` 被 design-to-plan 拦住 | 未人工批准 | `hx gate approve <change> --gate design-to-plan --approver <name>` |
| `spec-validate` 失败 | delta spec 格式/场景不足 | 在 propose 会话补 EARS + 每 Requirement ≥2 Scenario |
| `spec-trace` 失败 | 测试名未含 `Scenario:` 原文 | 补测试或走 waiver |
| 前后端改乱目录 | 未按 `@group` 约束 | apply 时限定 app 路径与 group |
| 并发 change archive 覆盖 | MODIFIED 整体替换语义 | `hx rebase check` 后重写 delta |
| enterprise propose 被拦 | PRD 未批准 | PM 重新 `hx req prd check` + `hx approve prd` |
| `.cursor/` 手改后行为异常 | 违反单源编译 | `hx adapter drift` 检查；改 `harnessX/assets/` 后 `hx adapter sync` |

---

## 13. 延伸阅读

| 文档 | 内容 |
| --- | --- |
| [场景 01：新项目接入](examples/01-新项目接入.md) | init、hooks、CI、adapter |
| [场景 02：标准功能全流程](examples/02-标准功能开发全流程.md) | 单人后端完整循环 |
| [场景 14：全栈多角色](examples/14-企业全栈多角色交付.md) | 前后端并行 apply |
| [场景 04：并发变更冲突](examples/04-并发变更冲突.md) | 多团队同 capability |
| [场景 15：enterprise 交接](examples/15-企业级需求到交付交接.md) | org 制品 → change → promote |
| [场景 13：并行编排](examples/13-v0.2-编排与并行交付.md) | `@group`、`--parallel`、`--fan-out` |
| [场景 09：多工具协作](examples/09-多工具协作与CI强制.md) | Cursor + Claude + CI 统一 gate |
| [场景 18：无头 Agent/MCP](examples/18-精简配置与无头Agent-MCP.md) | 无 Cursor UI 的 apply |
| [操作说明 §6](operation-guide.zh-CN.md) | dev 命令参数详情 |
| [产品经理手册](pm-req-manual.zh-CN.md) | req 阶段（dev 前置） |
| [架构师手册](arch-hld-manual.zh-CN.md) | arch 阶段（dev 前置与 promote） |
| [场景选择指南](examples/00-场景选择指南.md) | 按角色选路径 |
