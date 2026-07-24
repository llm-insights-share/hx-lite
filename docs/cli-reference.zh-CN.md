# hx CLI 速查

面向专业用户的命令面约定（P0–P4）。详细角色流程见 [enterprise-delivery.zh-CN.md](enterprise-delivery.zh-CN.md)；Hub 维护见 [hxhub-usage.zh-CN.md](hxhub-usage.zh-CN.md)。

## 命名空间

| 命名空间 | 职责 |
| --- | --- |
| `hx project` | create / sync-hub / pull-assets |
| `hx change` | create / list / explore / propose / design / plan / apply / verify / archive |
| `hx gate` | check / advance / approve / hook / replay |
| `hx req` / `hx arch` / `hx dev` / `hx test` / `hx stage` | 阶段状态与 org 任务 |
| `hx asset` / `hx hub` / `hx adapter` | 本地资产、Hub 消费、IDE 编译 |
| `hx doctor` | 环境 + harness 完整性 + lock + adapter |
| `hx next` | 工作区 / 组织阶段 / change 的下一步 CLI / IDE 入口 |
| `hx tui` | 轻量交互壳（需 TTY） |

`hx hub …` 与独立二进制 `hxhub` **共享同一实现**（`registerHubCommands`）。维护者专用子命令（`init` / `doctor` / `fix` / AI `help`）仅在 `hxhub` 上暴露。

## Sensor 可配置化

反馈检查在 `harness.yaml` 的 `sensors:` 中声明。**对外三种 `check`**：`inline`（谓词 `expr`）、`shell`（`run` + `HX_*`/`$OUTPUT`）、`rules`（`rules_text`/`rules_file` + `input`）。完整手册见 **[Sensor 配置使用手册](sensor-config-manual.zh-CN.md)**。

| 字段 | 含义 |
| --- | --- |
| `check` | `inline` / `shell` / `rules`（可省略，由 `expr`/`run`/`rules_*` 推断） |
| `expr` | inline 谓词，如 `approval.prd == true`、`spec.ears_ok == true` |
| `run` / `output` | shell 命令与 `$OUTPUT` 路径模板 |
| `rules_text` / `rules_file` / `input` | rules 准则与检查对象 globs |
| `source` / `config` | 资产目录与内联覆盖（深度合并） |

场景示例：[examples/en/10-custom-sensors-triggers.md](examples/en/10-custom-sensors-triggers.md)。`hx harness lint --completeness` / `hx doctor` 会校验 sensor 路径。

## 兼容别名

下列顶层命令仍可用，等价于 `hx change …`：

`hx propose` · `hx explore` · `hx design` · `hx plan` · `hx apply` · `hx verify` · `hx archive`

## 退出码

| Code | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 业务失败（gate blocked、sensor、drift、lock） |
| 2 | 用法/参数错误（含非交互缺少 `--yes`） |
| 3 | 环境/配置（`hx doctor` 发现错误） |

## 破坏性操作

以下操作需要 `--yes`，或在交互 TTY 下输入 `yes` 确认：

- `hx project create --overwrite`
- `hx change archive` / `hx archive`
- `hx hub push` / `hx hub push-github`（及 `hxhub` 对应命令）

## 常用旗标

| 旗标 | 用途 |
| --- | --- |
| `--json` | `gate check`、`stage status`、`project sync-hub`、`adapter targets`、`doctor`、`next` |
| `--dry-run` | `project sync-hub`、`change apply`、`change archive`、`hxhub seed` 等 |
| `--locale en\|zh` | 阶段状态表语言（默认跟随 `config.yaml locale`） |

## IDE 入口

`hx adapter sync` 后：

- Cursor / Claude / Qoder：斜杠 `/hx-<stage>-<task>`
- Trae：`.trae/skills/hx-<stage>-<task>/SKILL.md`（无 slash）
- generic / Codex / OpenCode：`AGENTS.md` 内联任务入口

`hx next` / `hx doctor` 会按 `config.adapter.target` 提示正确入口。

## TUI 完整菜单（`hx tui`）

`hx tui` 是与 `hx` / `hxhub` **对等的菜单驱动 TUI**：在进程内执行同一套 Commander 命令，无需切换终端。也可继续使用纯 CLI。

**中文界面**：`hx tui --locale zh`，或 `config.yaml` 中 `locale: zh-CN`。

### 全局操作

| 输入 | 动作 |
| --- | --- |
| `menu` / `菜单` | 打开完整命令菜单（全部命名空间） |
| `open <n>` / `<n>` | 选择当前列表第 n 项 |
| `home` | 回到工作区上下文首页 |
| `back` | 返回上一屏 |
| `help` / `帮助` | 帮助 |
| `quit` / `exit` / `退出` | 退出 |

### 工作区上下文屏

| 输入 | 动作 |
| --- | --- |
| `focus` / `next` | 进入推断焦点 |
| `req` / `arch` / `changes` | 进入组织/变更上下文 |
| `doctor` | **执行** `hx doctor`（非仅打印） |
| `gate` / `guide` / `status` | 进入对应命令子菜单 |

### 菜单命名空间（与 CLI 对齐）

`workspace` · `quick`（doctor/next）· `project` · `change` · `gate` · `guide` · `req` · `arch` · `stage` · `hub` · `hxhub` · `sdlc` · `adapter` · `asset-lock` · `behaviour` · `steering` · `orchestration` · `approve` · `hooks-ci` · `openspec` · `mcp`

选择 `[run]` 项后在 TUI 内执行；带参数的命令会提示输入；破坏性操作需输入 `yes` 确认。

无 TTY 时请改用 `hx` / `hxhub` CLI。

### Hub / HXHub（菜单内）

原 TUI 单词 Hub 指令已并入 `hub` / `hxhub` 子菜单，直接执行 `hx project sync-hub`、`hx hub search`、`hxhub doctor` 等。

## 典型下一步

```bash
hx doctor
hx next
hx next <change>
hx gate check <change> --stage <s> --task <t>
hx adapter sync
```
