# 阶段任务 × Guide × Sensor 资产矩阵

权威任务目录：[`packages/core/src/stages.ts`](../packages/core/src/stages.ts)  
Harness 绑定：[`packages/scaffold/base/harness.yaml`](../packages/scaffold/base/harness.yaml)  
阶段说明：[delivery-stages.zh-CN.md](delivery-stages.zh-CN.md)

原则：每个任务至少 **1 command + 1 skill（或 template）+ 1 非空 suite**；后续演进优先改资产，不改阶段模型。

## 目标态（补充后）

### req

| 任务 | 必选 | Command | Guides | Suite | Sensors |
| --- | --- | --- | --- | --- | --- |
| `biz-understanding` | 否 | `cmd-biz-understanding` | `requirements-research-outline`（harness 另有同源 `biz-understanding-outline`） | opt `req-biz` | `req-biz-understanding` |
| `requirements-research` | 否 | `cmd-explore` | `requirements-research-outline` | opt `req-research` | `req-research-complete` |
| `requirements-analysis` | 是 | `cmd-requirements-analysis` | `requirements-analysis` | `req-analysis` | `req-analysis-complete` |
| `prototype-design` | 是 | `cmd-prototype-design` | `prototype-wireframe` | `req-prototype` | `org-prototype-complete` |
| `prd-writing` | 是 | `cmd-prd` | `prd-template`, `prd-authoring` | `prd-check` | `prd-complete`, `prd-approved` |

### arch

| 任务 | 必选 | Command | Guides | Suite | Sensors |
| --- | --- | --- | --- | --- | --- |
| `subsystem-division` | 是 | `cmd-arch` | `arch-hld-template`, `arch-authoring` | `arch-subsystem` | `arch-hld-complete`, `arch-registry-complete` |
| `tech-selection` | 是 | `cmd-tech-selection` | `tech-selection` | `arch-tech` | `arch-tech-selection-complete` |
| `database-design` | 是 | `cmd-database-design` | `database-design`, `db-migration-template` | `arch-db` | `arch-database-design-complete` |
| `interface-design` | 是 | `cmd-interface-design` | `interface-design`, `api-contract-template` | `arch-iface` | `arch-interface-design-complete` |
| `key-mechanisms` | 否 | `cmd-key-mechanisms` | `key-mechanisms` | opt `arch-key` | `arch-key-mechanisms-complete` |
| `internal-interface` | 是 | `cmd-arch-lld` | `arch-lld-template`, `arch-module-boundary` | `arch-lld-check` | `arch-lld-complete`, `arch-module-boundary`, `arch-lld-approved` |

### dev

| 任务 | 必选 | Command | Guides | Suite (standard / enterprise) | Sensors（要点） |
| --- | --- | --- | --- | --- | --- |
| `plan` | 是 | `cmd-plan` | `change-planning`, `rollback-template` | `plan-basic` / `plan-sdlc` | `plan-coverage`（+ Ent `wo-lld-done`） |
| `propose` | 是 | `cmd-propose` | `proposal-template`, `requirements-template`, `prd-writing`, `spec-writing` | `propose-basic` / `propose-sdlc` | `requirements-complete`, `spec-validate`（Ent 更全） |
| `design` | 是 | `cmd-design` | `design-template`, `ui-pages-template`, `fe-layout`, `design-tokens` | `design-basic` / `design-sdlc` | `design-hld-complete`, `design-lld-complete`（Ent 更全） |
| `apply` | 是 | `cmd-apply` | `coding-conventions` | `fast`（lite：`fast-lite`） | `spec-validate`, `typecheck`, `lint`, `unit-changed` |
| `verify` | 是 | `cmd-verify` | `release-readiness-checklist` | `verification` / `verification-sdlc` | `spec-validate`, `spec-trace`, `drift`, `integration-smoke`（+ Ent） |
| `archive` | 是 | `cmd-archive` | `archive-checklist` | `archive-check` / `archive-check` | `spec-validate` |

### test

| 任务 | 必选 | Command | Guides | Suite | Sensors |
| --- | --- | --- | --- | --- | --- |
| `test-case-design` | 是 | `cmd-test-design` | `test-case-authoring`, `test-cases-template` | `test-design-sdlc` | `test-cases-complete`, `test-cases-approved` |
| `test-execution` | 是 | `cmd-test-execution` | `test-execution`, `uat-checklist` | `test-execution-sdlc` | `uat-complete`, `bugs-closed`, `test-report-complete` |

## Profile 启用任务

| Profile | 启用任务 |
| --- | --- |
| `lite` | `dev`: propose, apply, archive |
| `standard` / `strict` / `enterprise` | req 必选三件套 + arch 必选五件套 + 全量 dev + 全量 test；可选任务仅 suite 绑定（biz/research/key-mechanisms） |

## 命名 Suite 目录（补充后）

| Suite | Sensors |
| --- | --- |
| `req-biz` | `req-biz-understanding` |
| `req-research` | `req-research-complete` |
| `req-analysis` | `req-analysis-complete` |
| `req-prototype` | `org-prototype-complete` |
| `prd-check` | `prd-complete`, `prd-approved` |
| `arch-subsystem` | `arch-hld-complete`, `arch-registry-complete` |
| `arch-tech` | `arch-tech-selection-complete` |
| `arch-db` | `arch-database-design-complete` |
| `arch-iface` | `arch-interface-design-complete` |
| `arch-key` | `arch-key-mechanisms-complete` |
| `arch-lld-check` | `arch-lld-complete`, `arch-module-boundary`, `arch-lld-approved` |
| `plan-basic` | `plan-coverage` |
| `plan-sdlc` | `plan-coverage`, `wo-lld-done` |
| `propose-basic` | `requirements-complete`, `spec-validate` |
| `propose-sdlc` | enterprise propose 套件 |
| `design-basic` | `design-hld-complete`, `design-lld-complete` |
| `design-sdlc` | enterprise design 套件 |
| `fast` / `fast-lite` | 快速实现门 |
| `verification` | `spec-validate`, `spec-trace`, `drift`, `integration-smoke` |
| `verification-sdlc` | 企业验证 + `integration-smoke` |
| `archive-check` | `spec-validate` |
| `test-design-sdlc` | `test-cases-complete`, `test-cases-approved` |
| `test-execution-sdlc` | `uat-complete`, `bugs-closed`, `test-report-complete` |

## 资产演进约定

1. **新检查项**：优先加 Sensor + 挂入已有命名 suite，勿新建 stage/task。
2. **新写法指导**：加 `guide.skill` / `guide.template`，在 harness `guides[]` 标注 `stage`+`task`。
3. **Hub**：可版本化资产放 `packages/hub-golden`；scaffold 保持开箱镜像。
