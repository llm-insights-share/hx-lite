# nhx 命令手册（项目 HX）

`nhx` 是面向项目 HX 交付的 CLI：从 WebUI 拉取任务资产、投影到 IDE、执行 Check 检查并提交产物。

## 1. 安装与前置

```bash
# 在仓库根目录
npm install -g .
nhx --help
```

- Node.js 版本：建议 >= 20
- 默认 API：`http://127.0.0.1:8000`
- 首次使用前请先启动 WebUI 后端（`/api/health` 可访问）

## 2. 与 hx 的隔离

- 本地目录使用 `.nhx/`（不占用 `harnessX/`）
- IDE 命令前缀为 `nhx-*`（不与 `hx-*` 冲突）
- hooks 采用合并写入（新增 `nhx-*` 条目，不覆盖原有 hooks）

## 3. 命令速查

| 命令 | 说明 |
|------|------|
| `nhx login` | 浏览器登录，成功后写入本地凭证 |
| `nhx login -u <user>` | 终端输入密码登录 |
| `nhx login -u <user> -p <pass>` | 用户名密码直登 |
| `nhx init --project <id\|slug> --stages <list>` | 初始化项目并同步资产 |
| `nhx sync [--stages <list>] [--targets <list>] [--prune]` | 按配置再同步，可叠加阶段 |
| `nhx adapter sync [--targets <list>]` | 只做 IDE 投影，不拉远端资产 |
| `nhx status` | 查看本地状态（配置、登录、命令等） |
| `nhx doctor` | 健康诊断（API、凭证、目录、投影） |
| `nhx check [--stage --task --channel --paths --json]` | 执行 Check 检查 |
| `nhx sensor check …` | （兼容别名）同 `nhx check` |
| `nhx session mark --stage <stage> --task <task>` | 记录当前会话任务上下文 |
| `nhx approve request --stage --task [--title --body --project --submit]` | 创建并提交人工审批工单 |
| `nhx approve status --stage --task [--project]` | 查询人工审批状态 |
| `nhx submit <path> --name <name> [--stage --task --note]` | 上传产物到 WebUI（文件或目录） |

## 4. 命令详解与示例

### 4.1 `login`

```bash
nhx login
nhx login -u admin
nhx login -u admin -p admin123
nhx login --api http://127.0.0.1:8000
nhx login --webui http://127.0.0.1:5173
```

- 无参数：打开浏览器登录页，回调写入 `.nhx/credentials`
- `-u` 不带 `-p`：终端提示输入密码
- `--api` / `--webui`：覆盖默认地址

### 4.2 `init`

```bash
nhx init --project 1 --stages req,dev
nhx init --project demo-proj --stages req --targets cursor,trae
nhx init --project 1 --stages req,arch --prune
```

- 必填：`--project`、`--stages`
- 将配置写入 `.nhx/config.yaml`
- 自动触发 adapter 投影

### 4.3 `sync`

```bash
nhx sync
nhx sync --stages arch
nhx sync --targets cursor
nhx sync --prune
```

- 无参数：按本地配置同步
- `--stages`：与已有阶段做 merge（叠加关注）
- `--prune`：删除本次导出之外的本地投影文件

### 4.4 `adapter sync`

```bash
nhx adapter sync
nhx adapter sync --targets cursor,trae
```

- 不请求 WebUI，仅将本地 `.nhx` 资产重投影到 IDE

### 4.5 `status` 与 `doctor`

```bash
nhx status
nhx doctor
```

- `status`：输出当前 root、api、登录状态、配置、命令列表
- `doctor`：检查 API 联通性、token、目录、投影有效性

### 4.6 `check`

```bash
nhx check
nhx check --stage req --task prd-writing
nhx check --channel hook:stop
nhx check --channel hook:afterFileEdit --paths docs/prd/PRD.md
nhx check --json
```

- 默认 `--channel cli`
- `hook:afterFileEdit` 场景建议带 `--paths` 便于 scope 匹配

### 4.7 `session mark`

```bash
nhx session mark --stage req --task prd-writing
```

- 记录当前任务上下文，供 hooks/检查流程读取

### 4.8 `approve request` / `approve status`

```bash
nhx approve request --stage req --task prd-writing
nhx approve request --stage req --task prd-writing --title "PRD人工审查" --submit
nhx approve status --stage req --task prd-writing
```

- 人工关卡依赖 `human-check` 工单状态
- 审批通过后，对应 `human` Check 才会 PASS

### 4.9 `submit`

```bash
nhx submit ./docs/prd/PRD.md --name prd --stage req --task prd-writing
nhx submit ./docs/arch/lld.md --name lld --stage arch --task arch-design --note "v2"
# 整个目录（递归上传，保留相对路径；自动创建子目录）
nhx submit ./docs/prd-pack --name prd-pack --stage req --task prd-writing
```

- `<path>` 可为单文件或目录；`--name` 必填
- 目录上传会跳过 `.git` / `node_modules` / `.DS_Store` 等
- `--stage --task` 建议与当前任务一致，便于资产关联

## 5. 推荐工作流

```bash
# 1) 登录
nhx login

# 2) 初始化
nhx init --project 1 --stages req,dev

# 3) 在 IDE 用 nhx 命令壳完成任务

# 4) 提交产物
nhx submit ./docs/prd/PRD.md --name prd --stage req --task prd-writing

# 5) 发起人工审批（如任务绑定了 human Check）
nhx approve request --stage req --task prd-writing

# 6) 审批后检查
nhx approve status --stage req --task prd-writing
nhx check --stage req --task prd-writing

# 7) 组织/项目配置变更后再同步
nhx sync
```

## 6. 本地目录布局

```text
.nhx/
  config.yaml
  credentials
  lock.json
  tasks.json
  guides/
  sensors/
  commands/
  skills/

.cursor/commands/nhx-*.md
.cursor/hooks/nhx-*.mjs
.trae/skills/nhx-*/
```

## 7. 常见问题

| 现象 | 排查建议 |
|------|----------|
| `nhx login` 失败 | 检查 `http://127.0.0.1:8000/api/health` 是否可访问 |
| `未登录` / token 失效 | 重新执行 `nhx login`，再 `nhx status` 确认 |
| 初始化后无命令壳 | 执行 `nhx adapter sync`，检查 `.cursor/commands/nhx-*.md` |
| 组织改了绑定但本地未生效 | 执行 `nhx sync`（必要时加 `--stages`） |
| human Check 一直不通过 | 确认工单类型是 `human-check` 且状态已 `approved` |
| 产物提交失败 | 校验文件路径存在、`--name` 有值、登录态有效 |

