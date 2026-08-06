# WebUI + nhx 使用手册

> 面向 **组织 HX 维护系统（WebUI）** 与 **项目 HX 交付 CLI（`nhx`）**。  
> 与传统 `hx` / `hxhub` **并行、互不影响**：本地目录、命令前缀、Hook 均隔离。

| 组件 | 作用 |
|------|------|
| WebUI | 组织配置、项目配置、产物、审批工单、GitHub 推送/同步 |
| `nhx` | 从 WebUI 按 stage 拉资产 → 投影到 Cursor/Trae → Check 检查 → 提交产物 / 发起人工审批 |

---

## 1. 概念模型

```text
组织 HX
  Profile → Stage → Task
              ├─ Guides（前馈：skill / template / …）
              └─ Checks（反馈：rules / shell / inline / human）
                    ↑
              Task 壳（Command Shell / Skill Shell，壳编辑器）
        ↓ 项目「初始化配置」
项目 HX（可再自定义 Guide / Check / Task）
        ↓ nhx init / sync
本地 .nhx/ + IDE 命令壳 nhx-*
```

要点：

- **任务直接绑定 Check**（已取消 Suite 中间层）。
- **人工审查** = 给 Task 绑定 `check_type=human` 的 Check；通过 **`human-check` 工单批准** 后关卡才过。
- 默认人工资产：`prd-approved`、`arch-lld-approved`、`test-cases-approved`。
- Guide 除 skill / template 外，还可使用 constraint / exemplar / scaffold / glossary / capability，并在组织设置中自定义 `guide.*` 类型；设计与样例见 [guide-kinds-harness-samples.zh-CN.md](./guide-kinds-harness-samples.zh-CN.md)。

---

## 2. 环境准备

### 2.1 启动 WebUI

```bash
cd webui
./start.sh          # 后端 :8000 + 前端 :5173
./status.sh
./stop.sh
```

或手动：

```bash
# 后端
cd webui/backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# 前端
cd webui/frontend && npm run dev
```

| 项 | 默认 |
|----|------|
| 前端 | <http://127.0.0.1:5173> |
| API | <http://127.0.0.1:8000> |
| 账号 | `admin` / `admin123` |

常用环境变量：`HX_WEBUI_GITHUB_TOKEN`、`HX_WEBUI_ADMIN_*`、`HX_WEBUI_DATABASE_URL`。组织「设置」中的 Token **优先于** 环境变量；项目 GitHub 同步会回退使用组织 Token。

### 2.2 安装 nhx

在仓库根目录：

```bash
npm install -g .    # 推荐：全局安装 hx / hxhub / nhx
# 等价开发方式：npm link
# 不安装也可：npm run nhx -- <args>
nhx --help
```

依赖 Node ≥ 20。登录默认连 `http://127.0.0.1:8000`，一般**不需要** `--api`。

---

## 3. 组织 HX（WebUI）

顶部切换到 **组织 HX 维护**。

### 3.1 首次引导

1. **工具 → 初始配置生成**：一键 bootstrap（Profile / Stage-Task / Guide / Check / Command）。
2. **设置**：填写组织名、GitHub 仓库 URL、Token（可选）。
3. **GitHub 推送**：导出 Hub → 预览 Diff → 推送。

### 3.2 配置菜单

| 菜单 | 做什么 |
|------|--------|
| Profile 管理 | 定义 lite / standard / … 及包含的 stage |
| Stage & Task | 维护任务矩阵；**直接多选 Guide / Check**；支持编辑绑定 |
| Guide & Check | 维护资产；Check Type：`rules` / `shell` / `inline` / **`human`** |
| 壳编辑器 | Task 壳（同时投影 Command Shell + Skill Shell） |

**Stage & Task 编辑建议：**

1. 打开目标 Task →「编辑」。
2. 在 **Check 资产** 勾选关卡（人工关卡如 `prd-approved`，列表中会标紫色）。
3. 保存。项目侧需「重新初始化」或本地 `nhx sync` 才会吃到变更。

### 3.3 Check Type

| 类型 | 含义 |
|------|------|
| `rules` | 文本质量规则（`rules_text` + 可选 `input`）：注入 Task 壳与 IDE hook 提示，**由当前对话模型评判**；`nhx` 本地不调用 LLM（也不同于旧 hx 的 `HX_JUDGE_CMD`）。若声明了 `input` 且文件均不存在，则确定性失败 |
| `shell` | 执行正文中首个 bash 代码块 |
| `inline` | 内置函数检查：`file.exists` / `file.min_bytes` / `doc.sections_complete` / `approval.*`（**文件存在性请用 `file.exists`，勿再用 rules**） |
| `human` | 人工审批态：**仅提醒「尚未批准」**（或已批准）；不做文件/脚本检查 |

### 3.4 触发通道（可多选）

| 通道 ID | 展示名 | 行为 |
|---------|--------|------|
| `hook:beforeSubmit` | 提交任务指令前 | Cursor hook；不阻断提交；human 提醒 |
| `hook:afterFileEdit` | 文件生成/编辑后 | 按 Scope glob 匹配后检查 |
| `hook:stop` | Agent 回合结束 | stop hook；失败可 followup；**rules** 即使通过也会追加自检提示 |
| `cli` | nhx 人工指令 | `nhx check`（默认） |
| `task-shell` | command/skill 壳 | 任务壳附录要求执行 check |

创建 Check 时「配置内容」只填 **check 专属字段**（如 `expr` / `rules_text` / bash 块）；**触发通道与 Scope 只在表单**配置，不要写入 content。选 `inline` 时可点击内置函数列表插入 `expr`。

**默认产物路径约定（AI 交付）：**

| 阶段 | 典型路径 |
|------|----------|
| req / arch | `docs/requirements/*`、`docs/prd/PRD.md`、`docs/architecture/*`、`docs/prototype/*`（组织设置「产物路径布局」为真相源；`docs/req` 为已废弃别名） |
| dev | `harnessX/changes/<id>/` 或 `openspec/changes/<id>/`（shell Check会解析 `HX_CHANGE` / 最新目录） |
| test | `docs/test/*` |

---

## 4. 项目 HX（WebUI）

顶部切换到 **项目 HX 管理**。

### 4.1 项目列表与初始化

1. **项目列表** → 创建项目，选择 **Profile**。
2. 点 **初始化配置**：从组织按 Profile 拉 Stage/Task，并复制组织中的 **全部 Guide、Check**，保留任务绑定。
3. 组织矩阵改绑后，可再点 **重新初始化**（会按组织最新配置刷新项目侧）。

进入项目详情可配置成员角色：`project_owner` / `approver` / `member`。

### 4.2 项目侧菜单

| 菜单 | 做什么 |
|------|--------|
| 产物列表 | 上传/查看产物版本（也可由 `nhx submit` 写入） |
| GitHub 同步 | 将项目 HX 推到项目仓（Token：组织设置或 `HX_WEBUI_GITHUB_TOKEN`） |
| Guide 管理 | 项目级 Guide |
| Check 管理 | 项目级 Check；可建/编辑 `human` 类型 |
| 自定义 Task | 新建自定义任务，或 **编辑** profile/custom 任务的 Guide/Check 绑定 |
| 审批工单 | 创建/提交/批准/驳回；人工关卡用类型 **`human-check`**，必填 Stage/Task |

### 4.3 自定义 Task

- 创建时可多选 Guide、Check（标签含 `· human` 即为人工关）。
- **编辑** 可改任意任务（含 from-profile）的绑定，无需删建。
- 创建自定义任务后会自动生成 Skill / Command 壳。

### 4.4 审批工单（人工审查）

1. 类型选 `human-check`，填写与任务一致的 **Stage / Task**。
2. 创建 → **提交** → 审批人 **批准**。
3. 仅 **已批准** 的 `human-check` 会使对应 human Check 通过（其它类型工单不计入）。

也可由 CLI：`nhx approve request`（创建并自动提交）。

---

## 5. nhx CLI（本地交付）

### 5.1 与 hx 的隔离

| 项 | `hx` | `nhx` |
|----|------|-------|
| 本地根 | `harnessX/` 等 | `.nhx/` |
| IDE 命令 | `hx-*` | `nhx-*` |
| Hooks | 原有 hooks | **合并**写入 `nhx-*.mjs`，不覆盖 hx |

### 5.2 命令一览

| 命令 | 说明 |
|------|------|
| `nhx login` | 打开浏览器登录/注册页（可 `--webui`）；成功后写回 `.nhx/credentials` |
| `nhx login -u <user>` | 终端提示密码后登录 |
| `nhx login -u <user> -p <pass>` | 直接验证登录（可选 `--api`） |
| `nhx init --project <id\|slug> --stages req,dev` | 首次拉资产并投影 IDE |
| `nhx sync [--stages …] [--prune]` | 再同步；`--stages` **叠加**关注阶段 |
| `nhx adapter sync` | 仅按本地 `.nhx` 重投影 |
| `nhx status` | 本地配置 / 会话状态 |
| `nhx doctor` | 检查 API、token、`.nhx`、IDE 投影 |
| `nhx check [--stage --task]` | 跑当前任务绑定的 Check |
| `nhx sensor check …` | （兼容别名）同 `nhx check` |
| `nhx session mark --stage … --task …` | 记录会话上下文（供 hooks） |
| `nhx approve request --stage … --task …` | 创建并提交 human-check 工单 |
| `nhx approve status --stage … --task …` | 查询审批状态 |
| `nhx submit <path> --name <产物名> [--stage --task]` | 上传产物到 WebUI（文件或整个目录） |

### 5.3 推荐工作流

```bash
# 1. 登录（需 WebUI 前端 :5173 + 后端 :8000）
nhx login                      # 打开浏览器登录/注册
# 或：nhx login -u admin       # 终端输密码
# 或：nhx login -u admin -p admin123

# 2. 在业务仓初始化（项目 ID 见 WebUI 项目列表）
nhx init --project 1 --stages req,dev

# 3. IDE 中使用 /nhx-req-prd-writing 等命令壳完成任务

# 4. 提交产物（单文件或整个目录）
nhx submit ./docs/prd/xxx.md --name prd --stage req --task prd-writing
nhx submit ./docs/prd-pack --name prd-pack --stage req --task prd-writing

# 5. 若任务绑了 human Check：发起审批
nhx approve request --stage req --task prd-writing

# 6. 审批人在 WebUI「审批工单」批准后
nhx approve status --stage req --task prd-writing
nhx check --stage req --task prd-writing

# 7. 组织/项目配置变更后
nhx sync
# 或叠加新阶段：
nhx sync --stages arch
```

### 5.4 本地目录

```text
.nhx/
  config.yaml       # api_base / project_id / stages / targets
  credentials       # JWT（勿提交）
  lock.json
  tasks.json        # stage/task → guides / sensors
  guides/
  sensors/          # *.md + *.meta.json（含 check_type）
  commands/
  skills/
.cursor/commands/nhx-*.md
.cursor/hooks/nhx-session.mjs
.cursor/hooks/nhx-check-stop.mjs
.cursor/hooks.json          # 合并条目，不整文件覆盖
.trae/skills/nhx-*/
```

### 5.5 Cursor Hooks

`init` / `adapter sync` 会合并 hooks：

| Hook | 脚本 | 行为 |
|------|------|------|
| `beforeSubmitPrompt` | `nhx-session.mjs` | 从提示中解析 `/nhx-<stage>-<task>` 并 `session mark` |
| `stop` | `nhx-check-stop.mjs` | 跑 `nhx check`；失败则 `followup_message` 追问 |

`nhx check` 对 `human` 会请求：

`GET /api/tickets/approval-status?project_id=&stage=&task=`  
（仅统计 `ticket_type=human-check`）。

---

## 6. 配置「任务结果需人工审查」

端到端最短路径：

1. **组织 → Guide & Check**  
   - 使用默认 `prd-approved`（已是 `human`），或新建 Check，Check Type = `human`。
2. **组织 → Stage & Task**  
   - 编辑目标 Task（如 `req` / `prd-writing`），勾选该 Check。
3. **项目 → 项目列表 → 重新初始化配置**  
   - 或本地已 init 过则执行 `nhx sync`。
4. 开发者完成产物后：  
   `nhx approve request --stage req --task prd-writing`
5. 审批人在 **项目 → 审批工单** 批准。
6. `nhx check` / Cursor stop hook 对应该关卡 **PASS**。

项目侧也可在 **Check 管理** 建 human Check，再在 **自定义 Task** 编辑绑定，不必改组织矩阵。

---

## 7. 角色速查

| 角色 | WebUI | nhx |
|------|-------|-----|
| 组织管理员 | bootstrap、矩阵、Guide/Check、GitHub 推送 | — |
| 项目负责人 | 建项、初始化、成员、自定义任务、同步 GitHub | `init` / `sync` |
| 开发者 | 上传产物（可选） | `login` → `init/sync` → IDE 任务 → `submit` → `approve request` |
| 审批人 | 审批工单批准/驳回 | `approve status`（查询） |

---

## 8. 故障排查

| 现象 | 处理 |
|------|------|
| `nhx login` 连不上 | 确认后端 `:8000`，`curl http://127.0.0.1:8000/api/health` |
| Token 失效 | 重新 `nhx login`；看 `nhx doctor` |
| 改了组织绑定但本地无变化 | 项目「重新初始化」或 `nhx sync` |
| human Check 一直 FAIL | 确认工单类型为 `human-check`、Stage/Task 完全一致、状态为 `approved` |
| 项目 GitHub 同步报 Token 未配置 | 在组织「设置」填 Token，或设 `HX_WEBUI_GITHUB_TOKEN` |
| IDE 无 nhx 命令 | `nhx adapter sync`；检查 `.cursor/commands/nhx-*.md` |
| 误伤 hx hooks | nhx 只合并 `nhx-*`；勿手改删掉 hx 原有条目 |

---

## 9. 相关文档

| 文档 | 内容 |
|------|------|
| [webui/README.md](../webui/README.md) | WebUI 启停、环境变量、API 概览 |
| [packages/nhx/README.md](../packages/nhx/README.md) | nhx 包内速查 |
| [docs/nhx-command-manual.zh-CN.md](nhx-command-manual.zh-CN.md) | nhx 命令手册（项目 HX） |
| [docs/cli-reference.zh-CN.md](cli-reference.zh-CN.md) | 传统 `hx` CLI 速查（非 nhx） |
| [docs/hxhub-usage.zh-CN.md](hxhub-usage.zh-CN.md) | `hxhub` / Hub 运维 |

---

## 10. 建议验收清单

- [ ] WebUI 登录；组织 bootstrap；Stage & Task 能编辑 Check 绑定  
- [ ] 新建/编辑 Check，`check_type=human` 显示紫色标签  
- [ ] 创建项目并初始化；自定义 Task 可编辑绑定  
- [ ] `nhx login` → `nhx init --project <id> --stages req`  
- [ ] IDE 可见 `/nhx-…` 命令；`.cursor/hooks.json` 含 nhx 条目  
- [ ] `nhx submit` 后产物出现在 WebUI  
- [ ] `nhx approve request` → WebUI 批准 → `nhx check` PASS  
- [ ] `nhx sync --stages arch` 叠加阶段成功  
