# nhx — 项目 HX 交付 CLI

独立于 `hx` / `hxhub`：从 WebUI 按 stage 同步资产，投影到 Cursor / Trae / CodeBuddy / WorkBuddy / Qoder，任务**直接绑定 Check**（无 Suite 层），并用 IDE hooks 做检查；支持人工审批工单。

**完整使用手册（WebUI + nhx）：** [docs/webui-nhx-usage.zh-CN.md](../../docs/webui-nhx-usage.zh-CN.md)

## 支持的 IDE

`nhx init` / `sync` / `adapter sync` 的 `--targets`（逗号分隔）。**默认** `cursor,trae`；其余需显式加入。

| `--targets` | IDE | Command 壳 | Skill 壳 | Hooks | 项目级 | 全局 `--global` |
|-------------|-----|------------|----------|-------|--------|-----------------|
| `cursor` | Cursor | ✓ `.cursor/commands/` | ✓ `.cursor/skills/` | `.cursor/hooks.json` | `.cursor/` | `~/.cursor/` |
| `trae` | Trae（国际版） | —（命令壳改写为 Skill） | ✓ `.trae/skills/` | `.trae/hooks.json` | `.trae/` | `~/.trae/` |
| `trae-cn` | Trae（中国版） | —（同上） | ✓ `.trae-cn/skills/` | `.trae/hooks.json` | `.trae-cn/` | `~/.trae-cn/` |
| `codebuddy` | CodeBuddy | ✓ `.codebuddy/commands/` | ✓ `.codebuddy/skills/` | `.codebuddy/settings.json` | `.codebuddy/` | `~/.codebuddy/` |
| `workbuddy` | WorkBuddy | ✓（项目同 CodeBuddy） | ✓（项目同 CodeBuddy） | 项目 `.codebuddy/settings.json` | `.codebuddy/` | `~/.workbuddy/` |
| `qoder` | Qoder | ✓ `.qoder/commands/` | ✓ `.qoder/skills/` | `.qoder/settings.json` | `.qoder/` | `~/.qoder/`（或 `$QODER_CONFIG_DIR`） |

```bash
nhx adapter sync --targets cursor,trae,qoder
nhx session mark --from-prompt "/nhx-req-prd" --ide qoder
```

## 快速开始

```bash
# 在仓库根目录
npm install -g .    # 推荐；也可用 npm link
nhx login
nhx init --project 1 --stages req,dev
nhx submit ./docs/prd.md --name prd --stage req --task prd-writing
nhx approve request --stage req --task prd-writing --artifact prd
# 审批人在 WebUI「审批工单」批准后：
nhx approve status --stage req --task prd-writing
nhx check --stage req --task prd-writing
nhx submit ./docs/prd-pack --name prd-pack --stage req --task prd-writing
```

## 命令

| 命令 | 说明 |
|------|------|
| `nhx login` | 打开浏览器登录/注册页，成功后写回本地凭证 |
| `nhx login -u <user>` | 终端提示输入密码后登录 |
| `nhx login -u <user> -p <pass>` | 直接验证登录（默认 API `http://127.0.0.1:8000`） |
| `nhx init / sync` | 拉取资产并投影 IDE |
| `nhx check` | 运行任务绑定的 Check（按 `--channel` 过滤触发通道；`--approval-refresh` 可强制实时查审批） |
| `nhx sensor check` | （兼容旧名）同 `nhx check` |
| `nhx session mark` | 记录当前 stage/task |
| `nhx approve request/status` | 发起 / 查询人工审批（`status --approval-refresh` 强制实时查询） |
| `nhx submit` | 上传产物（单文件或目录递归） |
| `nhx doctor` / `status` / `adapter sync` | 诊断与重投影 |

## 任务 ↔ Check（无 Suite）

导出与自定义任务均将 Check **直接挂在 Task** 上。本地 `.nhx/tasks.json` 记录绑定关系。

`nhx sync` / `adapter sync` **始终**投影两种壳（同一份 body+appendix）。默认写入**项目目录**；加 `-g, --global` 则写入 IDE 用户级目录（跨项目可用）：

| 壳 | 项目级（默认） | 全局 `--global` |
|----|----------------|-----------------|
| Command Shell | `.cursor/commands/`、`.codebuddy/commands/`、`.qoder/commands/` | `~/.cursor/commands/`、`~/.codebuddy/commands/`、`~/.workbuddy/commands/`、`~/.qoder/commands/` |
| Skill Shell | `.cursor/skills/`、`.trae/skills/`、`.codebuddy/skills/`、`.qoder/skills/` | `~/.cursor/skills/`、`~/.trae/skills/`、`~/.codebuddy/skills/`、`~/.workbuddy/skills/`、`~/.qoder/skills/` |

Cursor / Trae Hooks 默认写在项目目录；CodeBuddy / WorkBuddy 项目级 Hooks 写入 `.codebuddy/settings.json`（全局分别为 `~/.codebuddy/settings.json` 与 `~/.workbuddy/settings.json`）；Qoder Hooks 写入 `.qoder/settings.json`（全局 `~/.qoder/settings.json`，或 `$QODER_CONFIG_DIR`）。范围保存在 `.nhx/config.yaml` 的 `install_scope`。

## IDE Hooks（Cursor / Trae / CodeBuddy / WorkBuddy / Qoder）

`nhx adapter sync` / `init` 会**合并**写入（不覆盖已有用户/hx hooks）：

**Cursor**（`.cursor/hooks.json`）：

- `beforeSubmitPrompt` → `nhx-session.mjs`（解析 `/nhx-stage-task` + `hook:beforeSubmit` 提醒）
- `stop` → `nhx-check-stop.mjs`（`hook:stop`；失败则 `followup_message`）
- `afterFileEdit` → `nhx-check-after-edit.mjs`（`hook:afterFileEdit` + scope）

**Trae / Trae-CN**（项目 `.trae/hooks.json`，中国版亦读取此路径）：

- `UserPromptSubmit` → `nhx-trae-prompt.mjs`（解析提示词 + `session mark --ide trae|trae-cn` + beforeSubmit 提醒）
- `Stop`（`loop_limit: 3`）→ `nhx-trae-stop.mjs`（`hook:stop`；未通过则 `decision: block`）
- `PostToolUse`（`matcher: Skill|Edit|Write`）→ `nhx-trae-post-tool.mjs`（Skill 调用 nhx-* 时上报；Edit/Write 后 afterFileEdit 检查）

**CodeBuddy / WorkBuddy**（`.codebuddy/settings.json`）：

- `UserPromptSubmit` → `nhx-codebuddy-prompt.mjs`（解析提示词 + `session mark --ide codebuddy|workbuddy` + beforeSubmit 提醒）
- `Stop` → `nhx-codebuddy-stop.mjs`（`hook:stop`；未通过则 `decision: block`）
- `PostToolUse`（`matcher: Skill|Edit|Write`）→ `nhx-codebuddy-post-tool.mjs`（Skill 调用 nhx-* 时上报；Edit/Write 后 afterFileEdit 检查）

**Qoder**（`.qoder/settings.json`）：

- `UserPromptSubmit` → `nhx-qoder-prompt.mjs`（解析提示词 + `session mark --ide qoder` + beforeSubmit 提醒）
- `Stop` → `nhx-qoder-stop.mjs`（`hook:stop`；未通过则 `decision: block`）
- `PostToolUse`（`matcher: Skill|Edit|Write`）→ `nhx-qoder-post-tool.mjs`（Skill 调用 nhx-* 时上报；Edit/Write 后 afterFileEdit 检查）

首次生成后请在 Trae「设置 → Hooks」中确认启用（外部写入的 hooks.json 需在安全提示面板允许一次）；CodeBuddy/WorkBuddy/Qoder 请在 IDE 设置中启用对应 `settings.json` 中的 Hook。

Check `check_type`：

| 类型 | 行为 |
|------|------|
| `rules` | 文本规则注入 Task 壳 / IDE hook，由对话模型评判；本地不跑 LLM。`input` 均缺失时确定性失败 |
| `shell` | 执行 content 中首个 bash 代码块 |
| `inline` | 内置函数：`file.exists` / `file.min_bytes` / `doc.sections_complete` / `approval.*`。`path` 支持 `*` / `**`；多文件匹配时须**全部**满足条件才通过 |
| `human` | 仅提醒「尚未批准」/已批准（查询 human-check 工单；不做文件脚本检查） |

触发通道（可多选，存在 Check.triggers）：

| 通道 | 含义 |
|------|------|
| `hook:beforeSubmit` | 提交任务指令前（不阻断） |
| `hook:afterFileEdit` | 文件编辑后（按 scope glob） |
| `hook:stop` | Agent 回合结束 |
| `cli` | `nhx check`（默认 channel） |
| `task-shell` | command/skill 壳文案要求执行 check |

## 配置人工审查（产品化）

1. **组织 HX → Guide & Check**：新建/编辑 Check，Check Type 选 **`human`**。
2. **组织 HX → Stage & Task**（或项目「自定义 Task」）：编辑目标 Task，在 **Check 资产** 中勾选该人工 Check。
3. 项目侧 **重新初始化配置** 或本地 `nhx sync`。
4. 完成后：先 `nhx submit` 上传产物 → `nhx approve request --stage … --task … --artifact …` → WebUI 批准 → `nhx check` 通过。

### 人工审批冷却检查（长流程友好）

- 人工审批经常跨 1-2 天，`nhx check` 对 pending 状态默认启用**本地冷却缓存**（默认 120 分钟），避免每次都重复远程确认或重复建单。
- 冷却期内会直接提示最近检查时间与下次检查时间；不会重复提交工单。
- 需要立即确认时可用：
  - `nhx check --stage <stage> --task <task> --approval-refresh`
  - `nhx approve status --stage <stage> --task <task> --approval-refresh`
- 可在 `.nhx/config.yaml` 设置：
  - `approval_check_interval_minutes: 120`

默认资产 `prd-approved` / `arch-lld-approved` / `test-cases-approved` 的 `check_type` 已为 **`human`**。启动后端时会对已有库做一次迁移升级。

## 布局

```text
.nhx/
  config.yaml  credentials  lock.json  tasks.json  path_layout.json
  guides/
    <asset_id>.md              # Guide 正文 / 占位说明
    <asset_id>/…               # content_mode=package 时的包文件（如 *.docx / *.xlsx）
  sensors/*.md + *.meta.json   # Check 资产落盘（历史目录名）
  commands/  skills/
.cursor/commands/nhx-*.md          # --global → ~/.cursor/commands/
.cursor/skills/*/SKILL.md         # --global → ~/.cursor/skills/
.cursor/hooks/nhx-*.mjs + hooks.json（合并，始终项目级）
.trae/hooks/nhx-trae-*.mjs + hooks.json（合并，始终项目级；Trae-CN 同读）
.trae/skills/nhx-*/               # --global → ~/.trae/skills/
.codebuddy/commands/nhx-*.md      # --global → ~/.codebuddy/commands/（WorkBuddy → ~/.workbuddy/commands/）
.codebuddy/skills/*/SKILL.md      # --global → ~/.codebuddy/skills/（WorkBuddy → ~/.workbuddy/skills/）
.codebuddy/hooks/nhx-codebuddy-*.mjs + settings.json（合并；全局 WorkBuddy → ~/.workbuddy/）
.qoder/commands/nhx-*.md          # --global → ~/.qoder/commands/（或 $QODER_CONFIG_DIR）
.qoder/skills/*/SKILL.md          # --global → ~/.qoder/skills/
.qoder/hooks/nhx-qoder-*.mjs + settings.json（合并）
```

### Template 包与产物扩展名

- 组织侧 Guide（`guide.template`）可为 **package** 模式，主文件可为 `.docx` / `.xlsx` / `.md` 等。
- `nhx sync` / `init` 会把包内文件落到 `.nhx/guides/<asset_id>/`，并在任务壳附录中写入：
  - **本任务建议文件**扩展名（跟随绑定 template 主文件，如 `docs/architecture/database-design.docx`）
  - 「主文件参考 …（扩展名须一致）」提示
- 门禁请与建议路径一致（例如 `arch-database-design-complete` 检查 `database-design.docx`）。
- 组织改了 package 或绑定后：重启/热加载后端 → 项目「重新初始化」或本地 `nhx sync`（必要时 `--prune`）。