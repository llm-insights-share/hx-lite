# HarnessX 关键设计总结

> **定位**：围绕 AI Coding Agent 的外层控制平面（Harness），用「规格驱动 + 前馈 Guide + 反馈 Sensor + fail-closed Gate」把「AI 写代码」变成「AI 在 Harness 里交付」。

---

## 1. 总体架构：三层控制平面

```text
L1  AI Coding IDE（Cursor / Claude / Trae / Qoder …）
     ↑ Adapter 投影（slash / skill / rules）+ L1 环境契约（HX_TASK_* / HX_FIX_*）
L2  hx-hub（组织级 Guide / Sensor 资产供应链）
L3  hx CLI（编排：Gate / Apply 循环 / Context Pack / doctor / next）
```

| 层 | 职责 |
|----|------|
| L1 | Agent 运行时；消费任务壳与上下文包 |
| L2 | 版本化资产注册表；按 Profile 下发到业务仓 |
| L3 | 门禁、阶段推进、强制机制；审计以 CLI 为准 |

**包边界**：`orchestration`（门禁/循环）· `hub`（资产解析）· `adapters`（IDE 编译）

---

## 2. 交付模型：Profile → Stage → Task

```text
Profile → Stage → Task → Guide（前馈）+ Sensor（反馈）
```

### 四阶段

| Stage | 作用域 | 主产出 |
|-------|--------|--------|
| `req` | 组织级 `docs/` | PRD / 调研 / 原型 |
| `arch` | 组织级 `docs/` | HLD + 模块 LLD |
| `dev` | Change 级 | 提案 → 设计 → 实现 → 验证 |
| `test` | Change 级 | 用例 → 执行 / UAT / 报告 |

`test` 是同一 Change 的后续阶段，**不是**独立实体。

### Profile 档位

| Profile | 典型任务集 |
|---------|------------|
| `lite` | `dev`: propose / apply / archive（快速 hotfix） |
| `standard` / `strict` / `enterprise` | req + arch 必选 + 全量 dev/test |

### 双轨交付

| 轨 | 路径 |
|----|------|
| 基线轨 | req/arch → 多 Change → 各 Change 的 test |
| 变更轨 | CR（需求/设计变更）→ linked Change → test |

工作单元是 **Change**（`harnessX/changes/<id>/`），不是「一次对话」。

---

## 3. Command / Skill 壳设计（TaskShell）

核心原则：**任务入口只是壳；真正起作用的是绑定的 Skill / Template。**

每个任务至少：**1 入口壳 + 1 skill/template + 1 非空 suite**。

### 组装流水线

```text
guide.workflow（或可选 guide.command 覆盖）
        +
assembleTaskShell() 自动附录
        │
        ├─ Context Pack 加载步骤
        ├─ Bound Skills / Templates 清单 + 选型指引
        ├─ Profile Suite → Sensors 清单
        └─ Gate 提醒（完成前必须 hx gate check）
        │
        ▼
hx adapter sync 按 IDE 能力投影
```

| 资产 | 角色 |
|------|------|
| `guide.workflow` | 任务壳正文（Input / Steps / Output），`assets/workflows/<stage>/<task>.md` |
| `guide.command` | 可选；覆盖 workflow，作为自定义斜杠命令正文 |
| `guide.skill` | 领域规范（真正驱动行为） |
| `guide.template` | 产出形状（真正约束结构） |

### 多 IDE 同一内容、不同投影

| IDE 能力 | 投影形态 | 示例 |
|----------|----------|------|
| 支持 commands | slash：`/hx-<stage>-<task>` | Cursor / Claude / Qoder |
| 无 command、有 skills | 任务入口 skill：`.trae/skills/hx-…/SKILL.md` | Trae |
| 仅 rules | inline 进 `AGENTS.md` / rules | Codex / OpenCode / generic |

手改 IDE 生成物会被下次 `adapter sync` 覆盖；演进优先改 **workflow / 资产 / harness.yaml**，不改阶段模型。

### 壳 vs 领域 Skill

| | 任务壳 | 领域 Skill |
|--|--------|------------|
| 用途 | 导航：加载包 → 跟规范 → 过门禁 | 教 Agent「怎么做对」 |
| 内容 | 薄清单 + 自动附录 | `SKILL.md` 包（可含 references/assets） |
| 生命周期 | sync 生成 | Hub / harness 绑定管理 |

---

## 4. Guide + Sensor 双环（控制工程视角）

```text
前馈（Guide）          反馈（Sensor）
做事前注入上下文  →  Agent 执行  →  任务边界验收
                                      │
                              fail → fix_hint → 自校正
                              pass → 推进下一任务
```

| 机制 | 设计要点 |
|------|----------|
| **Context Pack** | 按 stage/task 裁剪：宪法 + 绑定 guides + 本 change/PRD/arch 制品；避免跨 change 噪音 |
| **Suite** | 具名 sensor 列表，绑定到 `profiles.*.tasks[].suite` |
| **Gate** | `hx gate check --stage --task`；崩溃 / 超时 / 不可解析 → **一律阻断（fail-closed）** |
| **Apply 循环** | 任务级执行 → suite 验收 → `fixHints` 回灌 → 重试直至绿或预算耗尽 |
| **Steering** | 重复失败蒸馏为 Skill / Rubric / 模板：拦截成本前移为预防资产 |

Sensor 三种声明形态（不必改引擎代码）：`inline` / `shell` / `rules`。

---

## 5. 资产供应链与解析层

```text
hxhub（组织仓）
   │ Owner: project create / sync-hub
   ▼
业务项目 Git（harnessX/ 已锁定资产）
   │ 成员: git pull → init → adapter sync
   ▼
本机 IDE 入口可用
```

**解析优先级**：`change > local > team > hub > builtin`  
未声明覆盖须在 `harness.yaml` 的 `overrides:` 写明原因。

资产生命周期：`draft → trial → enforced → deprecated`。

---

## 6. Adapter Tier 与门禁补偿

每个 IDE 声明能力（commands / skills / rules / hooks / MCP …），推导 **Tier 0/1/2**。

低档 IDE → **门禁补偿**：额外 sensor、warn 升格为 block，必要时建议 headless apply，避免「弱运行时静默放行」。

L1 标准交接变量：`HX_TASK_*`（apply）/ `HX_FIX_*`（fix），见 `schemas/l1/agent-env-contract.json`。

---

## 7. 人机分工约定

| 通道 | 做什么 |
|------|--------|
| **IDE**（slash / Trae skill） | 写正文与设计 |
| **CLI** | `init` / `check` / `approve` / `archive` / 工单；**最终审计以 CLI 为准** |
| **导航** | `hx doctor`（健康）/ `hx next`（下一步）/ `hx tui`（交互壳） |

退出码：`0` 成功 · `1` 业务失败 · `2` 用法 · `3` 环境/配置。

---

## 8. 设计口诀（一句话版）

1. **阶段模型稳定，资产可演进**：改 skill/template/suite，不改 req→arch→dev→test。  
2. **壳薄、核厚**：command/skill 入口只负责「加载 + 选型 + 过门」；规范在绑定 guides。  
3. **单源多投**：一套 TaskShell，按 IDE 能力投影为 command / skill / rules。  
4. **前馈防偏、反馈纠偏、门禁硬挡**：Guide 缩小自由度，Sensor 给 `fix_hint`，Gate fail-closed。  
5. **Hub 供血、项目落盘、成员只拉仓**：组织资产经 Owner 写入业务 Git，成员不必人人直连 hub。
