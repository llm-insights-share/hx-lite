# HarnessX 概念词表

一页速查：HX、Hub 与交付编排中的核心术语。

## 分层模型（谁负责什么）

| 层 | 名称 | 职责 |
|----|------|------|
| L1 | AI Coding IDE | Agent 运行时（Cursor、Trae、Qoder 等）。通过 Adapter 输出与 L1 环境契约（`HX_TASK_*`、`HX_FIX_*`）消费指南。 |
| L2 | hx-hub | 共享资产注册表（guide.* / sensor.* 包）。Git 目录或团队 hub 根路径。 |
| L3 | HX 编排 | `hx` CLI — 门禁、apply 循环、上下文包、强制机制。 |

## 核心概念

### HX（HarnessX）

围绕 AI 编程 Agent 的**外 harness**：规格驱动交付，含 **guides**（方向）、**sensors**（验证）、**gates**（阶段推进）。HX 不替代 IDE，而是协调 Agent 可见内容与推进前必须通过的检查。

### Harness 实例

已初始化的项目工作区：`harnessX/` 含 `harness.yaml`（资产注册表）、`config.yaml`（项目选择）、`constitution.md`，以及 `changes/` 下按 change 组织的制品。

### Change

一次 **开发+测试一体** 的交付工作单元（功能、修复、迁移）。目录在 `harnessX/changes/<id>/`，含 `meta.yaml`（阶段/任务状态）、delta spec、可选设计与任务，以及 `changes/<id>/assets/` 资产覆盖层。

- **dev** 典型任务：`propose` → `design` → `apply` → `verify`（profile 还可含 `plan` / `archive`）
- **test** 是同一 Change 的后续阶段（`test-case-design` → `test-execution`），**不是**独立的 `Test.Change` 实体
- 一次组织需求（PRD）下可并行多个 Change（`hx change create --prd <slug>`）

### 需求变更 / Change Request（CR）

对 **组织级** 已批准制品的结构化补丁（`hx cr`），不是 Dev Change：

- `kind`: `requirement-change` | `design-change`
- 存储：`harnessX/change-requests/CR-*.yaml`
- 流程：创建 → submit → 工单批准 → 写入 PRD/LLD（并作废过期批准）
- 批准后通常再 `hx change create … --from-cr <id>`（或 `hx cr link`）进入 **变更轨** 开发与测试

### 双轨交付

| 轨 | 路径 | 说明 |
| --- | --- | --- |
| **基线轨** | req/arch（org）→ 多个 Dev Change → 各 Change 的 test | 新功能/新需求切片 |
| **变更轨** | CR（需求变更）→ linked Change → 同 Change 的 test | 基线批准后的需求/设计变更 |

`hx next` / `hx tui` 工作区报告用 `tracks.baseline` / `tracks.delta` 展示双轨。

### Profile（工作流配置）

工作流档位：`lite` / `standard` / `strict` / `enterprise`。定义启用哪些 **Stage**、各阶段 **Task** 集合，以及各任务绑定的 sensor **Suite**。权威任务清单见 [delivery-stages.zh-CN.md](delivery-stages.zh-CN.md)。

项目 owner 创建时指定 profile，从 hxhub 拉取该 profile 下全部 stage.task 相关资产写入项目 GitHub。

### Stage（交付阶段）

四阶段交付语义：`req`（需求）、`arch`（设计）、`dev`（开发）、`test`（测试）。`req`/`arch` 为组织级（`docs/`）；`dev`/`test` 为 change 级（`harnessX/changes/<id>/`）。

本地成员可在 `config.yaml` 的 `active_stages` 中选择一个或多个 stage（须为项目 profile 的子集）。

### Task（阶段任务）

阶段内的具体工作单元，如 `req` 阶段的 `prd-writing`、`dev` 阶段的 `propose`/`design`/`apply`。`hx gate check --stage <stage> --task <task>` 在任务粒度运行 sensor 套件。

### Guide（FeedForward）

前馈资产：Rules、Template、Skill、Constraint、Workflow、Command 等。在任务开始前注入 Agent 上下文。

- **`guide.skill` / `guide.template`**：领域规范与产出形状（真正起作用的实体）。
- **`guide.workflow`**：任务壳正文（Input / Steps / Output），位于 `assets/workflows/<stage>/<task>.md`。
- **`guide.command`（可选）**：覆盖 workflow 正文的自定义斜杠命令壳；未配置时由 workflow 组装。

### TaskShell（任务壳）

任务级 command / skill **只是壳**：`assembleTaskShell` 将 workflow（或 command 覆盖）与绑定的 skill/template、suite sensors、gate 提醒组装成同一内容，再按 IDE 能力投影为 slash command（Cursor / Claude / Qoder）、`.trae/skills/` 任务入口 skill（Trae），或 inline 进 `AGENTS.md` / rules（generic 等）。

### Doctor / Next / Exit codes

- **`hx doctor`**：聚合 harness 完整性、lock、adapter tier、hub 配置；错误级问题以 exit code **3** 退出。
- **`hx next`**：支持三种上下文（workspace / org / change），建议下一条 CLI，并给出 IDE 入口（slash 或 Trae skill 路径）。
- **退出码**：0 成功；1 业务失败（gate/sensor）；2 用法错误；3 环境/配置。详见 [cli-reference.zh-CN.md](cli-reference.zh-CN.md)。

### ContextReport / Workspace Focus

`hx next` 与 `hx tui` 使用统一的上下文报告（ContextReport）：

- `workspace`：工作区首页，展示 profile、active stages、change 列表与推断焦点
- `org`：组织级阶段任务（`req` / `arch`）
- `change`：change 级任务（`dev` / `test`）

工作区焦点推断优先级：**未完成的 org 必选任务 > 单一 active change > workspace 导航模式**。

### Sensor（FeedBack）

反馈资产：rule、script、rubric、fixture、budget、drift 等。在任务/门禁边界验收；失败返回 `fix_hint`。

### Suite（套件）

具名 sensor id 列表（如 `fast`、`verification`、`verification-sdlc`、`design-basic`）。首选通过 `profiles.*.tasks[].suite` 绑定到 stage/task；可选任务可用顶层兼容字段 `suites: { "req.biz-understanding": "req-biz" }`。

### Asset（资产）

带 `asset.yaml` 清单的版本化目录单元（guide.* / sensor.*）。**归属某个 stage.task**。生命周期：draft → trial → enforced → deprecated。

### Asset Layer（资产解析层）

同一 asset id 多处出现时的优先级：

`change > local > team > hub > builtin`

未声明的覆盖需在 `harness.yaml` 的 `overrides:` 中写明原因。

### Tier（适配器能力档）

L1 IDE 的能力档位（0 / 1 / 2），由 Adapter 声明的能力（commands、skills、hooks、MCP 等）推导。低档触发 **门禁补偿**（额外 sensor、warn 升格为 block）。

## 两种「层」的含义

| 术语 | 含义 |
|------|------|
| 组织分层 L1/L2/L3 | IDE → Hub → 编排（上表） |
| 资产层 Asset Layer | 单个 asset id 的解析栈（change/local/team/hub/builtin） |

## L1 标准契约

Tier-1 Agent 通过环境变量接收结构化交接（见 `schemas/l1/agent-env-contract.json`）：

- **Apply**：`HX_TASK_ID`、`HX_TASK_TITLE`、`HX_TASK_PACK`、`HX_FIX_HINTS` 等
- **Fix**：`HX_FIX_PACK`、`HX_FIX_SENSOR`、`HX_FIX_HINTS`
