# nhx — 项目 HX 交付 CLI

独立于 `hx` / `hxhub`：从 WebUI 按 stage 同步资产，投影到 Cursor / Trae，任务**直接绑定 Check**（无 Suite 层），并用 IDE hooks 做检查；支持人工审批工单。

**完整使用手册（WebUI + nhx）：** [docs/webui-nhx-usage.zh-CN.md](../../docs/webui-nhx-usage.zh-CN.md)

## 快速开始

```bash
# 在仓库根目录
npm install -g .    # 推荐；也可用 npm link
nhx login
nhx init --project 1 --stages req,dev
nhx check --stage req --task prd-writing
nhx approve request --stage req --task prd-writing
# 审批人在 WebUI「审批工单」批准后：
nhx approve status --stage req --task prd-writing
nhx submit ./docs/prd.md --name prd --stage req --task prd-writing
nhx submit ./docs/prd-pack --name prd-pack --stage req --task prd-writing
```

## 命令

| 命令 | 说明 |
|------|------|
| `nhx login` | 打开浏览器登录/注册页，成功后写回本地凭证 |
| `nhx login -u <user>` | 终端提示输入密码后登录 |
| `nhx login -u <user> -p <pass>` | 直接验证登录（默认 API `http://127.0.0.1:8000`） |
| `nhx init / sync` | 拉取资产并投影 IDE |
| `nhx check` | 运行任务绑定的 Check（按 `--channel` 过滤触发通道） |
| `nhx sensor check` | （兼容旧名）同 `nhx check` |
| `nhx session mark` | 记录当前 stage/task |
| `nhx approve request/status` | 发起 / 查询人工审批 |
| `nhx submit` | 上传产物（单文件或目录递归） |
| `nhx doctor` / `status` / `adapter sync` | 诊断与重投影 |

## 任务 ↔ Check（无 Suite）

导出与自定义任务均将 Check **直接挂在 Task** 上。本地 `.nhx/tasks.json` 记录绑定关系。

`nhx sync` / `adapter sync` **始终**投影两种壳（同一份 body+appendix）：

- **Command Shell** → `.nhx/commands/nhx-*.md` → `.cursor/commands/`
- **Skill Shell** → `.nhx/skills/nhx-*/SKILL.md` → `.cursor/skills/`（及 Trae 等无 slash 的 IDE）

## IDE Hooks（Cursor）

`nhx adapter sync` / `init` 会**合并**写入（不覆盖已有 hx hooks）：

- `beforeSubmitPrompt` → `nhx-session.mjs`（解析 `/nhx-stage-task` + `hook:beforeSubmit` 提醒）
- `stop` → `nhx-check-stop.mjs`（`hook:stop`；失败则 `followup_message`）
- `afterFileEdit` → `nhx-check-after-edit.mjs`（`hook:afterFileEdit` + scope）

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
4. 完成后：`nhx approve request --stage … --task …` → WebUI 批准 → `nhx check` 通过。

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
.cursor/commands/nhx-*.md
.cursor/hooks/nhx-*.mjs + hooks.json（合并）
.trae/skills/nhx-*/
```

### Template 包与产物扩展名

- 组织侧 Guide（`guide.template`）可为 **package** 模式，主文件可为 `.docx` / `.xlsx` / `.md` 等。
- `nhx sync` / `init` 会把包内文件落到 `.nhx/guides/<asset_id>/`，并在任务壳附录中写入：
  - **本任务建议文件**扩展名（跟随绑定 template 主文件，如 `docs/architecture/database-design.docx`）
  - 「主文件参考 …（扩展名须一致）」提示
- 门禁请与建议路径一致（例如 `arch-database-design-complete` 检查 `database-design.docx`）。
- 组织改了 package 或绑定后：重启/热加载后端 → 项目「重新初始化」或本地 `nhx sync`（必要时 `--prune`）。