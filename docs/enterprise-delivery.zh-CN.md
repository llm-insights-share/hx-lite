# 企业 AI 交付全过程手册

**适用 profile**：`enterprise`（亦适用于 `standard` / `strict`；`lite` 跳过 req/arch）  
**产品版本**：hx-lite v0.1+  
**Hub 运维**：[hxhub 使用手册](hxhub-usage.zh-CN.md)  
**阶段权威定义**：[delivery-stages.zh-CN.md](delivery-stages.zh-CN.md)

本手册按角色说明「谁在什么阶段做什么」。**写文档走 IDE（斜杠命令或 Trae skill）；脚手架、门禁、批准、归档走 CLI。**

CLI 速查（命名空间、`doctor`/`next`/`tui`、退出码、`--yes`）：[cli-reference.zh-CN.md](cli-reference.zh-CN.md)。

---

## 0. 总览

### 0.1 分层与模型

```text
L1 IDE（Cursor / Trae 等） ← Adapter 斜杠命令或 .trae/skills / Pack
L2 hxhub            ← Guide / Sensor 供应链
L3 hx CLI           ← Gate / Change / doctor / next / 工单
```

### 0.1.1 日常导航命令

| 命令 | 用途 |
| --- | --- |
| `hx doctor` | 检查 harness 完整性、lock、adapter tier（失败 exit 3） |
| `hx next [change]` | 工作区/组织阶段/change 的建议 CLI、IDE 入口（Cursor slash 或 Trae skill） |
| `hx tui [change]` | 工作区上下文轻量交互壳（需 TTY；可无参启动） |
| `hx change …` | 规范路径；`hx propose` 等仍为兼容别名 |

破坏性操作（`--overwrite`、`archive`、`hub push*`）需 `--yes` 或交互确认。退出码：0 成功 / 1 业务失败 / 2 用法 / 3 配置。

---
```text
Profile → Stage → Task → Guide（前馈）+ Sensor（反馈）
```

| 阶段 | ID | 作用域 | 主产出 |
| --- | --- | --- | --- |
| 需求 | `req` | 组织级 `docs/prd/` | PRD + 调研/分析/原型 |
| 设计 | `arch` | 组织级 `docs/architecture/` | HLD + 模块 LLD |
| 开发 | `dev` | Change `harnessX/changes/<id>/` | 提案、设计、代码、验证 |
| 测试 | `test` | Change 级 | 用例、UAT、缺陷、测试报告 |

状态机：

```text
req → arch → change create → dev → test → archive
```

双轨：

```text
基线轨:  req/arch → 多个 Change (propose/design/apply/verify…) → 各 Change 的 test
变更轨:  hx cr（需求变更）→ change create --from-cr / cr link → 同 Change 的 test
```

`test` 是 Change 的阶段，不是独立 `Test.Change`。词表见 [glossary.zh-CN.md](glossary.zh-CN.md)。

### 0.2 角色对照

| 角色 | 主阶段 | 本章 |
| --- | --- | --- |
| 技术经理 | 立项、工单、关键门禁 | [§1](#1-技术经理) |
| 产品经理 | `req` | [§2](#2-产品经理) |
| 架构师 | `arch` | [§3](#3-架构师) |
| 开发人员 | `dev` | [§4](#4-开发人员) |
| 测试人员 | `test` | [§5](#5-测试人员) |

### 0.3 资产怎么进本地（全体必读）

```text
组织 hxhub（Guide/Sensor）
        │  Owner：hx project create --profile --hub …
        ▼
业务项目 GitHub（harnessX/ 已含锁定资产）
        │  各角色：git clone / git pull
        ▼
本机工作区 → hx init --stages … → hx adapter sync → 开始角色任务
```

| 谁 | 做什么 |
| --- | --- |
| **Owner（通常技术经理）** | 从 **组织 hxhub** 按 profile 拉资产进业务仓，再 **推到项目 GitHub** |
| **全体成员** | 从 **项目 GitHub** 拉仓（资产已在仓库里），再本地 `init` + `adapter sync` |

成员**不必**人人直连 hxhub；日常拿到的是「已写入项目仓」的 Guide/Sensor。组织 Hub 升级后，由 Owner 执行 `hx project sync-hub` 并 **push 项目仓**，成员用 `hx project pull-assets`（只更新 harness 资产，不动 `changes/` / `docs/` / 业务代码）。

各角色推荐的 `active_stages` 与逐步命令见下文各章「准备本地项目环境」。

### 0.4 指令约定（读表必读）

| 列 | 含义 |
| --- | --- |
| **任务** | Stage 任务 ID（或流程步骤名） |
| **CLI / IDE** | `CLI:` 终端命令；`IDE:` 斜杠命令 `/hx-<stage>-<task>`（Cursor/Claude/Qoder）或 Trae 任务入口 skill `.trae/skills/hx-<stage>-<task>`（`hx adapter sync` 后） |
| **任务说明** | 该步要交付什么 |
| **Guide** | 前馈资产（Skill / Template / Workflow） |
| **Sensor** | 反馈检查项（suite 内执行） |
| **Gate** | 过门命令：`hx gate check` / `hx req\|arch check` / `hx approve` 等 |
| **备注** | 人批准、工单、易错点等 |

**原则**：正文与设计用 **IDE**；`init` / `check` / `approve` / `archive` / 工单用 **CLI**。斜杠命令 / 任务入口 skill 内部也会提示你跑 CLI——最终审计记录以 CLI 为准。任务壳正文为薄清单（Input / Steps / Output / Guardrails / Done when）；Skills、Templates、suite Sensors 由 `adapter sync` 自动附录注入（见 [stage-task-assets.zh-CN.md](stage-task-assets.zh-CN.md)）。

---

## 1. 技术经理

**目标**：立项（从 hxhub 拉资产进项目 GitHub）、工单、关键人工门、质量俯瞰；不写业务 PRD/代码正文。

### 1.0 准备本地项目环境（含从 hxhub → 项目 GitHub）

技术经理兼 **Owner** 时，负责把组织 Hub 资产写入业务仓并推远程；之后自己与其它角色都从**项目 GitHub** 工作。

| 步骤 | CLI / IDE | 说明 |
| --- | --- | --- |
| 1. 安装工具 | **CLI:** `npm install && npm link`（hx-lite）或团队安装包 | 本机有 `hx` / `hxhub` |
| 2. 组织 Hub 就绪 | **CLI:** 确认 `git@…/hx-hub.git` 可访问；预览 `hxhub resolve --profile enterprise --hub <hub>` | Hub 运维见 [hxhub 手册](hxhub-usage.zh-CN.md)；无 Hub 时可先 `hxhub seed` |
| 3. 业务仓初始化 | **CLI:** 在空业务仓或新目录执行 `hx project create --profile enterprise --hub <组织 hxhub URL> --adapter cursor --actor <name> [--locale hx-cn]` | **从 hxhub 按 profile 拉取** stage.task 资产写入 `harnessX/` |
| 4. 本地门禁与 IDE | **CLI:** `hx hooks install`；`hx adapter sync`；`hx lock write` | hooks / 斜杠 / 锁 |
| 5. 推到项目 GitHub | **CLI:** `git add harnessX docs … && git commit && git push -u origin main` | **成员只拉项目仓**，不必人人配 Hub |
| 6. Owner 本机日常 | **CLI:** `git pull`；需要时 `hx init --stages req,arch,dev,test`；`hx adapter sync` | 技术经理建议激活全阶段，便于俯瞰与批准 |
| 7. Hub 资产升级后 | **CLI:** `hx project sync-hub`（可选 `--adapter-sync`；可选 `--commit --push`） | 落盘 `.hub-cache` → `assets/` + `harness.yaml` + lock；再通知成员 `hx project pull-assets` |

```yaml
# config.yaml（create 后常见形态）
profile: enterprise
active_stages: [req, arch, dev, test]
hub: { source: git@…/hx-hub.git, role: consumer, actor: li.lead }
adapter: { target: cursor }
```

成员（含技术经理第二台机器）若项目已存在，跳过步骤 3–5，按 [§2.0](#20-准备本地项目环境从项目-github-获取资产)「clone → init --stages → sync」即可，阶段建议：`req,arch,dev,test`。

### 1.1 任务序列

| 任务 | CLI / IDE 指令 | 任务说明 | Guide | Sensor | Gate | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| （环境）立项与推仓 | **CLI:** 见 [§1.0](#10-准备本地项目环境含从-hxhub--项目-github) | 从 hxhub 拉资产 → 项目 GitHub | scaffold | — | `hx lock verify` | Owner 一次性；之后成员只 pull 项目仓 |
| Hub 预览 | **CLI:** `hxhub resolve --profile enterprise --hub <url\|path>` | 预览将按 profile 拉取的资产 | — | — | — | 立项前或升级前 |
| 工单收件 | **CLI:** `hx wo inbox --role tech-manager`；`hx wo show/extract <id>` | 审 req/arch/用例/缺陷工单 | — | 关联 WO Sensor（如 `wo-*`） | — | enterprise 建议 `workorders: required` |
| 工单裁决 | **CLI:** `hx wo approve <id> --by …` / `hx wo reject … --reason …` | 放行或打回 | — | — | 工单状态机即门；关联制品再用下方 approve Gate | 批准 PRD 工单后仍建议跑 `hx approve prd` |
| 批准 PRD | **CLI:** 见 Gate | org 需求门 | — | `prd-approved` | `hx approve prd <slug> --approver …` | 绑定 PRD hash |
| 批准全局架构 | **CLI:** 见 Gate | org HLD 门 | — | `arch-approved` | `hx approve arch --approver …` | 绑定 overview+registry hash |
| 批准模块 LLD | **CLI:** 见 Gate | 模块接口门 | — | `arch-lld-approved` | `hx approve arch-lld <module> --approver …` | change design 会查 |
| 批准 design→plan | **CLI:** 见 Gate | 开发进入 plan 前 | — | 门禁硬编码 | `hx gate approve <change> --gate design-to-plan --approver …` | **仅 CLI**；IDE 不能代替 |
| 批准测试用例 | **CLI:** 见 Gate | 用例执行前 | — | `test-cases-approved` | `hx gate approve <change> --gate test-cases --approver …` | 可先 `hx test-cases submit` |
| 进度俯瞰 | **CLI:** `hx stage status --stage req\|arch`；`hx stage status <change> --stage dev\|test`；见 Gate | 看完成度与复放 | — | — | `hx gate replay` | 无对应斜杠；仪表向 CLI |
| 豁免 / 回流 | **CLI:** `hx waiver add …`；`hx steer report`；Hub `hxhub submit/promote` | 临时豁免或沉淀规则 | Rubric/Skill | 目标 Sensor 可 waived | 被 waive 的 Sensor 在后续 `hx gate check` 中降级为 warning | 豁免有过期时间 |

### 1.2 配置要点

```yaml
# roles.yaml
workflow: { workorders: required }
```

`config.yaml` / `hub` / `adapter` 见 [§1.0](#10-准备本地项目环境含从-hxhub--项目-github)。

### 1.3 协同备注

- `hx change create --domains …` 重叠会警告  
- 紧急 hotfix 可用 `lite`，事后补追溯  

---

## 2. 产品经理

**目标**：组织级 PRD 与 sidecar（调研 / 分析 / 原型）完备并获批准。  
**路径**：`docs/prd/<slug>.md`、`docs/prd/<slug>/{research,analysis,prototype/}`。

### 2.0 准备本地项目环境（从项目 GitHub 获取资产）

前置：技术经理已完成 Owner 立项（见 [§1.0](#10-准备本地项目环境含从-hxhub--项目-github)）并把 `harnessX/`（含从 hxhub 拉取的资产）推到**业务项目 GitHub**。

| 步骤 | CLI / IDE | 说明 |
| --- | --- | --- |
| 1. 安装工具 | **CLI:** `npm install -g` 团队提供的 hx，或克隆 hx-lite 后 `npm install && npm link` | 本机有 `hx` / `hxhub` |
| 2. 拉取项目 | **CLI:** `git clone <业务项目 GitHub URL> && cd <repo>`；已有仓则 `git pull` | **资产已在仓库** `harnessX/`（Owner 曾 `--hub` 写入，不是再连组织 Hub） |
| 3. 依赖 | **CLI:** `npm install`（若项目有 package.json） | 按仓库约定 |
| 4. 激活阶段 | **CLI:** `hx init --stages req` | 只开需求阶段（可按需加 `arch` 只读浏览） |
| 5. 同步 IDE | **CLI:** `hx adapter sync` | Cursor/Claude/Qoder：`/hx-req-*` 斜杠命令与 Skills；Trae：`.trae/skills/hx-req-*` 与领域 Skills |
| 6. 可选校验 | **CLI:** `hx lock verify`；`hx req status` | 确认锁与任务清单正常 |

资产有更新时：`hx project pull-assets`（可选 `--adapter-sync`）；勿用全仓 `git pull` 覆盖本地未提交的 change/文档工作——该命令只同步 harness 资产路径。

### 2.1 任务序列

| 任务 | CLI / IDE 指令 | 任务说明 | Guide | Sensor | Gate | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| （环境）拉仓与激活 | **CLI:** 见 [§2.0](#20-准备本地项目环境从项目-github-获取资产) | 从项目 GitHub 取得 hxhub 已入库资产并 sync IDE | — | — | `hx lock verify`（可选） | 推荐 `hx init --stages req` |
| （准备）脚手架 | **CLI:** `hx req prd init <slug> --title "..."` | 创建 PRD + research/analysis/prototype 脚手架 | `prd-template` | — | — | 一次生成 sidecar；补建可用 `hx req research\|analysis\|prototype init` |
| `biz-understanding`（可选） | **IDE:** `/hx-req-biz-understanding`（若已 sync）；Skill 读写笔记<br>**CLI:** 见 Gate | 业务背景与问题意识 | `requirements-research-outline` | `req-biz-understanding`（warn） | `hx gate check --stage req --task biz-understanding --prd <slug>` 或 `hx req check --task biz-understanding --prd <slug>` | 可选；无独立制品时仅 warn |
| `requirements-research`（可选） | **IDE:** `/hx-req-requirements-research`；填 `research.md`<br>**CLI:** 见 Gate | 干系人调研与 Findings | `requirements-research-outline`、`cmd-explore` | `req-research-complete` | `hx req check --task requirements-research --prd <slug>` | 须填 Findings/干系人正文，空脚手架不过门 |
| `requirements-analysis`（必选） | **IDE:** `/hx-req-requirements-analysis`<br>**CLI:** 见 Gate | 问题/用户/优先级分析 | `requirements-analysis`、`cmd-requirements-analysis` | `req-analysis-complete` | `hx req check --task requirements-analysis --prd <slug>` | 制品：`docs/prd/<slug>/analysis.md` |
| `prototype-design`（必选） | **IDE:** `/hx-req-prototype-design`<br>**CLI:** 见 Gate | 组织级线框页面清单 | `prototype-wireframe`、`cmd-prototype-design` | `org-prototype-complete` | `hx req check --task prototype-design --prd <slug>` | 制品：`prototype/pages.md`；dev 设计时可与 change 原型二选一 |
| `prd-writing`（必选） | **IDE:** `/hx-req-prd-writing`<br>**CLI:** `hx req prd check <slug>`；见 Gate | 写完 PRD 正文（故事、AC、范围、NFR、评审结论） | `prd-authoring`、`prd-template`、`cmd-prd` | `prd-complete`、`prd-approved` | `hx req check --task prd-writing --prd <slug>` | 改文件后批准失效 |
| PRD 人工批准 | **CLI only:** `hx req prd submit <slug> --by <pm>`（可选工单）→ 见 Gate | 人工背书，绑定制品 hash | — | `prd-approved`（后续 dev.propose 会查） | `hx approve prd <slug> --approver <name>`（或 `hx gate approve --gate prd --prd <slug> --approver …`） | 技术经理可在工单后执行 approve |

**批量检查（CLI）**：`hx req check --prd <slug>`（依次跑必选任务）  
**进度**：`hx req status` → `docs/.stage-progress.yaml`

### 2.2 与研发衔接

- Change：`hx change create … --prd <slug>`（**CLI**）；同 PRD 可并行多个 Change
- 需求变更：`hx cr create --kind requirement-change`（**CLI**），勿静默改已批准 PRD
- 变更轨闭环：CR 批准/应用后 → `hx change create <id> --domains … --from-cr <CR-id>`（或 `hx cr link <CR-id> <change>`）→ 同 Change 走完 `dev`/`test`

---

## 3. 架构师

**目标**：组织级 HLD / 分节完备 + 模块 LLD 批准；支撑 change 对齐与沉淀。  
**路径**：`docs/architecture/overview.md`、`registry.yaml`、`modules/<id>/lld.md`。

### 3.0 准备本地项目环境（从项目 GitHub 获取资产）

| 步骤 | CLI / IDE | 说明 |
| --- | --- | --- |
| 1. 安装工具 | **CLI:** 安装 `hx`（同 §1.0） | — |
| 2. 拉取项目 | **CLI:** `git clone <业务项目 GitHub>` 或 `git pull` | 取得已含 hxhub 资产的 `harnessX/` |
| 3. 激活阶段 | **CLI:** `hx init --stages arch`（建议加 `req` 以便对照 PRD：`req,arch`） | 本地 `active_stages` |
| 4. 同步 IDE | **CLI:** `hx adapter sync` | Cursor/Claude/Qoder：`/hx-arch-*` 与 arch Skills；Trae：`.trae/skills/hx-arch-*` |
| 5. 可选校验 | **CLI:** `hx lock verify`；`hx stage status --stage arch` | — |

勿在本机重复 `hx project create`（会冲突）；Hub 升级靠 Owner `sync-hub` push 后成员 `hx project pull-assets`。

### 3.1 任务序列

| 任务 | CLI / IDE 指令 | 任务说明 | Guide | Sensor | Gate | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| （环境）拉仓与激活 | **CLI:** 见 [§3.0](#30-准备本地项目环境从项目-github-获取资产) | 从项目 GitHub 取得资产；`init --stages arch` | — | — | `hx lock verify`（可选） | 勿重复 project create |
| （准备）HLD 脚手架 | **CLI:** `hx arch init --title "..."` | 创建 overview + registry | `arch-hld-template` | — | — | 模板已含选型/库表/接口/关键机制专节 |
| `subsystem-division`（必选） | **IDE:** `/hx-arch-subsystem-division`<br>**CLI:** 见 Gate | 系统边界、模块划分、注册表 | `arch-authoring`、`arch-hld-template`、`cmd-arch` | `arch-hld-complete`、`arch-registry-complete` | `hx arch check --task subsystem-division` | 空占位不过门 |
| `tech-selection`（必选） | **IDE:** `/hx-arch-tech-selection`<br>**CLI:** 见 Gate | 运行时/存储等选型与理由 | `tech-selection`、`cmd-tech-selection` | `arch-tech-selection-complete` | `hx arch check --task tech-selection` | 须填满章节正文，非空标题 |
| `database-design`（必选） | **IDE:** `/hx-arch-database-design`<br>**CLI:** 见 Gate | 实体、引擎、迁移策略 | `database-design`、`db-migration-template`、`cmd-database-design` | `arch-database-design-complete` | `hx arch check --task database-design` | 同上 |
| `interface-design`（必选） | **IDE:** `/hx-arch-interface-design`<br>**CLI:** 见 Gate | 外部与系统间接口 | `interface-design`、`api-contract-template`、`cmd-interface-design` | `arch-interface-design-complete` | `hx arch check --task interface-design` | 模块内部接口在 LLD |
| `key-mechanisms`（可选） | **IDE:** `/hx-arch-key-mechanisms`<br>**CLI:** 见 Gate | 幂等/一致性等 | `key-mechanisms`、`cmd-key-mechanisms` | `arch-key-mechanisms-complete`（warn） | `hx arch check --task key-mechanisms` | 可选 |
| 全局架构批准 | **CLI:** `hx arch submit --by …`（可选）→ 见 Gate | 人工背书 HLD | — | `arch-approved` | `hx approve arch --approver …` | **仅 CLI**；也可用 `hx arch check`（含 `arch-check` suite）做汇总 |
| `internal-interface`（必选） | **IDE:** `/hx-arch-internal-interface`<br>**CLI:** `hx arch lld init <module> --title "..."` → `hx arch lld check <module>` → 见 Gate | 模块 LLD（IF-xxx 等） | `arch-lld-template`、`arch-module-boundary`、`cmd-arch-lld` | `arch-lld-complete`、`arch-module-boundary`、`arch-lld-approved` | `hx arch check --task internal-interface --module <id>` → `hx approve arch-lld <module> --approver …` | 批准绑定 LLD hash |
| 与 change 对齐 / 沉淀 | **CLI:** `hx arch align <change>`；`hx arch promote <change> --by …` | 诊断对齐；设计沉回 org LLD | — | `arch-change-align`、`arch-drift` | `hx arch align <change>`（诊断门）；drift 多在 `dev.verify` suite | promote 建议在 archive 前 |

**进度**：`hx stage status --stage arch`  
**Pack（可选 CLI）**：`hx guide arch-pack [--module <id>]`

### 3.2 双轨备注

- `docs/architecture/` = 系统长什么样  
- `changes/<id>/design/` = 本次怎么改  
- 禁止用 change 设计替代组织级 HLD  

---

## 4. 开发人员

**目标**：change 上 propose → design → plan → apply → verify → archive。  
**前置**：enterprise 下 PRD/架构相关门禁已绿；本地已按 §4.0 就绪。

### 4.0 准备本地项目环境（从项目 GitHub 获取资产）

| 步骤 | CLI / IDE | 说明 |
| --- | --- | --- |
| 1. 安装工具 | **CLI:** 安装 `hx` | — |
| 2. 拉取项目 | **CLI:** `git clone <业务项目 GitHub>` 或 `git pull` | `harnessX/` 内 Guide/Sensor 已由 Owner 从 hxhub 写入 |
| 3. 激活阶段 | **CLI:** `hx init --stages dev`（常开 `dev,test`；需读 PRD/架构时加 `req,arch`） | — |
| 4. 同步 IDE | **CLI:** `hx adapter sync` | Cursor/Claude/Qoder：`/hx-dev-*` 与 coding Skills；Trae：`.trae/skills/hx-dev-*` |
| 5. 可选 hooks | **CLI:** `hx hooks install`（若仓库未统一装） | 本地 commit 前快检 |
| 6. 可选校验 | **CLI:** `hx lock verify`；`hx change list` | — |

多人协同：各自 clone 同一项目 GitHub；资产版本以仓库 `harness.lock` / `harness.yaml` 为准。

### 4.1 任务序列

| 任务 | CLI / IDE 指令 | 任务说明 | Guide | Sensor（enterprise 要点） | Gate | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| （环境）拉仓与激活 | **CLI:** 见 [§4.0](#40-准备本地项目环境从项目-github-获取资产) | 从项目 GitHub 取得资产；`init --stages dev` | — | — | `hx lock verify`（可选） | 常开 `dev,test` |
| （准备）建 change | **CLI:** `hx change create <id> --domains … [--prd …] [--arch-modules …]` | 创建 change 工作区 | — | — | — | 域重叠会警告 |
| `propose`（必选） | **IDE:** `/hx-dev-propose`<br>**CLI:** `hx propose <change> --title "..."` → 见 Gate | proposal + delta + requirements 蒸馏 | `proposal-template`、`spec-writing`、`prd-writing`、`requirements-template`、`cmd-propose` | suite `propose-sdlc`：`prd-*`、`requirements-extended-complete`、`spec-validate` 等 | `hx gate check <change> --stage dev --task propose` | 不写实现代码 |
| `design`（必选） | **IDE:** `/hx-dev-design`<br>**CLI:** `hx design <change>` → 见 Gate | change 级设计包 + delta 定稿，对齐 org LLD | `design-template`、`ui-pages-template`、`fe-layout`、`design-tokens`、`cmd-design` | `design-hld/lld-complete`、`arch-*-approved`、`prototype-complete`、`arch-change-align` 等 | `hx gate check <change> --stage dev --task design` | UI：`design/ui/pages.md` **或** org 原型二选一；规格人工批准走 `hx gate approve --gate spec` |
| design→plan 批准 | **CLI only:** 见 Gate | 人工放行进入计划 | — | 硬编码门 | `hx gate approve <change> --gate design-to-plan --approver …` | 通常技术经理执行 |
| `plan`（必选） | **IDE:** `/hx-dev-plan`<br>**CLI:** `hx plan <change>` → 见 Gate | 双轨 `tasks.md` | `change-planning`、`rollback-template`、`cmd-plan` | `plan-coverage`、`wo-lld-done` | `hx gate check <change> --stage dev --task plan` | 须已有 design-to-plan 批准 |
| `apply`（必选） | **IDE:** `/hx-dev-apply`；先加载 pack<br>**CLI:** `hx guide task-pack <change> <taskId>` → `hx apply …`；失败 `hx fix` → 见 Gate | 按任务实现代码 | `coding-conventions`、`cmd-apply` | suite `fast`（spec/typecheck/lint/unit…） | `hx gate check <change> --stage dev --task apply` | Pack 须 Agent **读入**；`--runner` 用 `HX_TASK_PACK` |
| `verify`（必选） | **IDE:** `/hx-dev-verify`<br>**CLI:** `hx verify <change>` → 见 Gate | 规格、追溯、漂移 | `release-readiness-checklist`、`cmd-verify` | `spec-validate`、`spec-trace`、drift、`integration-smoke` 等 | `hx gate check <change> --stage dev --task verify` | **不含** UAT/bugs 硬拦（在 test） |
| `archive`（必选） | **IDE:** `/hx-dev-archive`（提示流程）<br>**CLI:** 见 Gate | 合并 delta → 主 specs | `archive-checklist`、`cmd-archive` | suite `archive-check`：`spec-validate` | `hx gate check <change> --stage dev --task archive` → `hx archive <change>` | 建议先 `hx arch promote`（架构师） |
| （推进） | **CLI:** 见 Gate | 当前 task 过门后进下一 task | — | — | `hx gate advance <change>` | 也可用手动指定 `--task` check |

**Pack 进入 Agent 的方式**：斜杠步骤内执行 `task-pack` → `@tasks/<id>-pack.md` → 或 `hx apply --runner` / MCP。

**lite 缩略**：`propose → apply → archive`（IDE：`/hx-dev-*` 对应任务）。

### 4.2 工作区

```text
harnessX/changes/<id>/
├── meta.yaml · proposal.md · specs/ · design/ · tasks.md
├── requirements/ · tasks/<taskId>-pack.md · traces/
```

---

## 5. 测试人员

**目标**：用例批准 → 执行报告 / UAT / 缺陷闭环。

### 5.0 准备本地项目环境（从项目 GitHub 获取资产）

| 步骤 | CLI / IDE | 说明 |
| --- | --- | --- |
| 1. 安装工具 | **CLI:** 安装 `hx` | — |
| 2. 拉取项目 | **CLI:** `git clone <业务项目 GitHub>` 或 `git pull` | 含 UAT/用例相关 template 等已入库资产 |
| 3. 激活阶段 | **CLI:** `hx init --stages test`（建议 `dev,test`，便于对照 change 制品） | — |
| 4. 同步 IDE | **CLI:** `hx adapter sync` | Cursor/Claude/Qoder：`/hx-test-*`；Trae：`.trae/skills/hx-test-*` |
| 5. 可选校验 | **CLI:** `hx lock verify`；`hx test status <change>`（已有 change 时） | — |

测某 change 前先 `git pull`，确保与开发现场的 `changes/<id>/`、规格一致。

### 5.1 任务序列

| 任务 | CLI / IDE 指令 | 任务说明 | Guide | Sensor | Gate | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| （环境）拉仓与激活 | **CLI:** 见 [§5.0](#50-准备本地项目环境从项目-github-获取资产) | 从项目 GitHub 取得资产；`init --stages test` | — | — | `hx lock verify`（可选） | 建议 `dev,test` |
| `test-case-design`（必选） | **IDE:** `/hx-test-test-case-design`（按模板填用例）<br>**CLI:** `hx test-cases init <change>` → 编辑后 `hx test-cases check` → `hx test-cases submit --by …` | 用例概览与覆盖 | `test-case-authoring`、`test-cases-template`、`cmd-test-design` | `test-cases-complete`、`test-cases-approved` | `hx test-cases check <change>` → 批准后 `hx gate check <change> --stage test --task test-case-design` | 提交后进入工单 |
| 用例人工批准 | **CLI only:** 见 Gate | 人工批准用例 | — | `test-cases-approved` | `hx gate approve <change> --gate test-cases --approver …` | 技术经理常见执行人 |
| 门禁确认 | **CLI:** 见 Gate | 确认设计任务通过 | — | suite `test-design-sdlc` | `hx gate check <change> --stage test --task test-case-design` | 与上一任务 Gate 合并执行亦可 |
| `test-execution`（必选） | **IDE:** `/hx-test-test-execution`<br>**CLI:** `hx test report init <change>`；维护 `uat-checklist.md`；`hx bug create/list/fix/close` → 见 Gate | 执行、UAT、缺陷关闭、测试报告 | `test-execution`、`uat-checklist`、`cmd-test-execution` | `uat-complete`、`bugs-closed`、`test-report-complete` | `hx gate check <change> --stage test --task test-execution` | **硬拦在此任务**；勿只在聊天记缺陷 |
| 进度 | **CLI:** `hx test status <change>` | 查看 test 任务完成情况 | — | — | — | — |

### 5.2 与开发边界

- 开发 `verify`：规格 / 自动化 / 追溯  
- 测试 `test-execution`：UAT 清单、缺陷状态机、`test-report.md`  

---

## 6. 端到端一页纸

```text
技术经理 Owner
  hxhub resolve → hx project create --hub <组织Hub>
  → hooks / adapter sync / lock write → push 业务项目 GitHub

各角色成员
  git clone 业务项目 GitHub（首次）
  → hx init --stages <按角色> → hx adapter sync
  资产更新：hx project pull-assets --adapter-sync

Owner Hub 升级
  hx project sync-hub [--commit --push]
  → 通知成员 pull-assets

产品经理  IDE: /hx-req-* → Gate: req check / approve prd
架构师    IDE: /hx-arch-* → Gate: arch check --task … / approve
技术经理  Gate: wo + design-to-plan / test-cases
开发      IDE: /hx-dev-* → Gate: gate check --stage dev
测试      IDE: 用例/UAT → Gate: test-case-design / test-execution
开发      archive
```

| Profile | 阶段 |
| --- | --- |
| `lite` | 仅 `dev` 短序列 |
| `standard` / `strict` / `enterprise` | `req` + `arch` + `dev` + `test` |

---

## 7. 常用命令速查

```text
# 环境（Owner → 项目 GitHub；成员 → pull-assets）
hxhub resolve --profile enterprise --hub <组织Hub>
hx project create --profile enterprise --hub <组织Hub> --adapter cursor
hx hooks install | hx adapter sync | hx lock write
git push
# Owner 升级 Hub：hx project sync-hub [--commit --push]
# 成员日常资产：hx project pull-assets --adapter-sync
# 成员首次：git clone → hx init --stages <角色> → hx adapter sync

# 需求（组织级）
hx req prd init|check|submit
hx req research|analysis|prototype init
hx req check --task <id> --prd <slug>
hx approve prd <slug> --approver …
# IDE: /hx-req-prd-writing · /hx-req-requirements-research · …

# 架构（组织级）
hx arch init|check|lld|promote|align
hx arch check --task <id> [--module]
hx approve arch|arch-lld
# IDE: /hx-arch-subsystem-division · /hx-arch-internal-interface · …

# 开发
hx change create|list
hx propose|design|plan|apply|verify|archive
hx guide task-pack | hx gate check|advance|approve | hx fix
# IDE: /hx-dev-propose · design · plan · apply · verify · archive

# 测试
hx test-cases init|check|submit
hx test report init | hx bug create|fix|close
hx gate check --stage test --task test-case-design|test-execution
# IDE: /hx-test-test-case-design

# 工单 / 治理
hx wo inbox|approve|reject
hx lock write|verify | hx waiver | hx steer report
```

斜杠命令需先 `hx adapter sync`；完整 walkthrough 见 [examples/README.md](examples/README.md) · 术语 [glossary.zh-CN.md](glossary.zh-CN.md)。
