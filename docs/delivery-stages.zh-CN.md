# AI 交付四阶段模型（HarnessX 权威定义）

本文档是 HarnessX **四阶段交付模型**的唯一权威说明。
**任务 × Guide × Sensor 完整矩阵**：[stage-task-assets.zh-CN.md](stage-task-assets.zh-CN.md)

## 四阶段总览

| 阶段 | ID | 产出 | 作用域 |
| --- | --- | --- | --- |
| 需求 | `req` | PRD + 调研/分析/原型 sidecar | 组织级 `docs/prd/` |
| 设计 | `arch` | 概要设计 + 子系统详细设计 | 组织级 `docs/architecture/` |
| 开发 | `dev` | 可运行代码 | Change 级 `harnessX/changes/<id>/` |
| 测试 | `test` | 测试用例 + 测试报告 | Change 级 |

## 任务清单（必选 / 可选）

### req — 需求

| 任务 | 必选 | Sensor | CLI |
| --- | --- | --- | --- |
| 业务理解 `biz-understanding` | 否 | `req-biz-understanding` (warn) | `hx gate check --stage req --task biz-understanding --prd <slug>` |
| 需求调研 `requirements-research` | 否 | `req-research-complete` | `hx req research init` → `hx req check --task requirements-research --prd <slug>` |
| 需求分析 `requirements-analysis` | 是 | `req-analysis-complete` | `hx req analysis init` → `hx req check --task requirements-analysis --prd <slug>` |
| 产品原型 `prototype-design` | 是 | `org-prototype-complete` | `hx req prototype init` → `hx req check --task prototype-design --prd <slug>` |
| PRD 编写 `prd-writing` | 是 | `prd-complete` (+ 人工 `prd` 批准) | `hx req prd init/check`、`hx approve prd` |

组织制品：`docs/prd/<slug>.md`、`docs/prd/<slug>/{research,analysis,prototype/pages}.md`。进度：`docs/.stage-progress.yaml`。

### arch — 设计

| 任务 | 必选 | Sensor | CLI |
| --- | --- | --- | --- |
| 子系统划分 | 是 | `arch-hld-complete`、`arch-registry-complete` | `hx arch init` → `hx arch check --task subsystem-division` |
| 技术选型 | 是 | `arch-tech-selection-complete` | 填 overview「技术选型」→ `hx arch check --task tech-selection` |
| 数据库设计 | 是 | `arch-database-design-complete` | `hx arch check --task database-design` |
| 接口设计 | 是 | `arch-interface-design-complete` | `hx arch check --task interface-design` |
| 关键设计机制 | 否 | `arch-key-mechanisms-complete` (warn) | `hx arch check --task key-mechanisms` |
| 内部接口 | 是 | `arch-lld-complete`、`arch-module-boundary`、`arch-lld-approved` | `hx arch lld init/check`、`hx approve arch-lld` |

无 `--task` 的 `hx arch check` 仍跑汇总 suite `arch-check`（HLD + registry + 已批准）。

### dev — 开发（change 流水线）

| 任务 | 必选 | HX 命令 |
| --- | --- | --- |
| 开发计划 `plan` | 是 | `hx plan <change>`（须先 `design-to-plan` 批准） |
| `propose` | 是 | `hx propose <change>` |
| `design` | 是 | `hx design <change>`（UI 时原型可为 change 或 org 二选一） |
| `apply` | 是 | `hx apply <change>` |
| `verify` | 是 | `hx verify <change>`（规格/追溯/漂移；UAT/缺陷改在 test-execution） |
| `archive` | 是 | `hx archive <change>` |

人工批准门：**design→plan**：`hx gate approve <change> --gate design-to-plan`。

### test — 测试

| 任务 | 必选 | Sensor | CLI |
| --- | --- | --- | --- |
| 用例设计 | 是 | `test-cases-complete`、`test-cases-approved` | `hx test-cases init/check/submit`、`hx gate check --stage test --task test-case-design` |
| 测试执行 | 是 | `uat-complete`、`bugs-closed`、`test-report-complete` | `hx test report init`、`hx bug …`、`hx gate check --stage test --task test-execution` |

## 状态机

```text
req (org) → arch (org) → change create → dev (change) → test (change) → archive
```

双轨（概念对齐）：

```text
基线轨:  req/arch → Dev.Change1..N (propose/design/apply/verify…) → 同 Change 的 test
变更轨:  需求变更(CR) → Dev.ChangeX (--from-cr / cr link) → 同 Change 的 test
```

图中所谓 `Test.ChangeX` = **同一 Change 进入 test 阶段**，不是第二类实体。详见 [glossary.zh-CN.md](glossary.zh-CN.md)。

- **lite**：仅 `dev`（短序列）
- **standard / strict / enterprise**：四阶段；suite 绑定见 scaffold `harness.yaml` 的 `profiles.*.tasks[].suite`（命名 suite，见 [glossary.zh-CN.md](glossary.zh-CN.md)）
- **工单**：`roles.yaml` → `workflow.workorders: required`

## 常用命令

```bash
hx req prd init <slug> --title "..."
hx req check --prd <slug>                    # 跑全部必选 req 任务
hx gate check --stage req --task prd-writing --prd <slug>
hx arch init --title "..."
hx arch check --task tech-selection
hx change create <id> --domains api --prd <slug>
hx gate check <change> --stage dev --task propose
hx gate check <change> --stage test --task test-execution
hx gate advance <change>
hx stage status --stage req
```

IDE 入口命名：支持 slash 的 IDE 为 `/hx-<stage>-<task>`（如 `/hx-dev-propose`、`/hx-arch-tech-selection`）；Trae 为 `.trae/skills/hx-<stage>-<task>/SKILL.md`。正文为薄清单；Skills/Templates/Sensor 由 `hx adapter sync` 附录注入。

## Profile 与阶段

| Profile | 阶段 | 说明 |
| --- | --- | --- |
| `lite` | dev | propose → apply → archive |
| `standard` / `strict` / `enterprise` | req, arch, dev, test | 含 org 任务 suite 与 `test-execution` |

Profile 启用任务写在 `harness.yaml`：

```yaml
profiles:
  standard:
    stages: [req, arch, dev, test]
    tasks:
      req:
        - id: requirements-analysis
          suite: req-analysis
      dev:
        - id: design
          suite: design-basic
        - id: apply
          suite: fast
```

任务目录（必选/标题）权威：[`packages/core/src/stages.ts`](../packages/core/src/stages.ts)；概念说明：[glossary.zh-CN.md](glossary.zh-CN.md)、[stage-task-assets.zh-CN.md](stage-task-assets.zh-CN.md)。
