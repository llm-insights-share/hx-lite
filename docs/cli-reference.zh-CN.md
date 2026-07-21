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

## TUI 单词指令（`hx tui` 工作区首页；`hx tui [change]` 直达变更）

输入英文单词后回车；**不支持单字符快捷键**。任意屏可用 `help` / `quit`（或 `exit`）。

### 首页（WorkspaceHome）

| 指令 | 动作 |
| --- | --- |
| `focus` / `next` | 进入系统推断焦点（org / pending CR / change） |
| `req` | 进入 req 上下文 |
| `arch` | 进入 arch 上下文 |
| `changes` | 进入 change 列表 |
| `status` | 打印 stage status 建议命令 |
| `doctor` | 跑 doctor 摘要 |
| `suggested` | 打印 workspace suggested CLI |
| `gate` | 打印 gate CLI（若有） |
| `guide` | 打印 guide CLI（若有） |
| `help` | 当前屏完整命令表 |
| `quit` / `exit` | 退出 |

### 详情页（Org / Change）

| 指令 | 动作 |
| --- | --- |
| `next` / `suggested` | 打印 suggested CLI |
| `gate` | 打印 gate check 命令 |
| `guide` / `pack` | 打印 guide pack 命令 |
| `status` | 打印 status 命令 |
| `doctor` | 跑 doctor 摘要 |
| `back` | 返回首页 |
| `changes` | （仅 change 页）切换 change |
| `prd` | （仅 req 页）选择 / 切换 PRD |
| `help` | 帮助 |
| `quit` / `exit` | 退出 |

### 列表选择（change / PRD picker）

| 指令 | 动作 |
| --- | --- |
| `open <n>` 或 `<n>` | 打开第 n 项 |
| `back` | 返回 |
| `help` / `quit` | 同上 |

无 TTY 时请改用 `hx next` / `hx doctor`。

## 典型下一步

```bash
hx doctor
hx next
hx next <change>
hx gate check <change> --stage <s> --task <t>
hx adapter sync
```
