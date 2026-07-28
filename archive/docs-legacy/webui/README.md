# HX WebUI

组织 HX 维护系统 + 项目 HX 管理系统（前后端分离，Python FastAPI 模块化单体 + Vue3 / Ant Design Vue + SQLite）。

不依赖现有 `hx` / `hxhub` CLI；领域逻辑在 `backend/app/domain/` 独立实现。GitHub 推送/同步由 Python Git 服务完成。交付侧配套 CLI 为 **`nhx`**（与 `hx` 隔离）。

**完整使用说明（WebUI + nhx）：** [docs/webui-nhx-usage.zh-CN.md](../docs/webui-nhx-usage.zh-CN.md)

## 目录

```text
webui/
  frontend/     Vue3 + Vite + ant-design-vue
  backend/      FastAPI + SQLModel + SQLite
  README.md
  docker-compose.yml
```

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `HX_WEBUI_SECRET_KEY` | JWT 密钥 | 开发默认值 |
| `HX_WEBUI_GITHUB_TOKEN` | GitHub PAT（组织/项目推送） | 空 |
| `HX_WEBUI_ADMIN_USERNAME` | 种子管理员 | `admin` |
| `HX_WEBUI_ADMIN_PASSWORD` | 种子密码 | `admin123` |
| `HX_WEBUI_DATABASE_URL` | SQLite URL | `webui/backend/data/hx_webui.db` |
| `HX_WEBUI_CORS_ORIGINS` | CORS | `http://localhost:5173,...` |

也可在组织「设置」页填写仓库 URL / Token（Token 优先于环境变量；项目同步会回退使用组织 Token）。

## 启停脚本

```bash
cd webui
./start.sh      # 启动后端 :8000 + 前端 :5173
./status.sh     # 查看状态
./stop.sh       # 停止
```

可选环境变量：`HX_WEBUI_BACKEND_PORT`、`HX_WEBUI_FRONTEND_PORT`。日志在 `webui/.run/logs/`。

## 本地启动

### 后端

```bash
cd webui/backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

健康检查：<http://127.0.0.1:8000/api/health>

### 前端

```bash
cd webui/frontend
npm install
npm run dev
```

打开 <http://127.0.0.1:5173> ，默认账号 `admin` / `admin123`。登录页提供自助注册（邮箱 + 用户名 + 密码，无需邮箱验证）；组织侧「用户管理」仅 `org_admin` 可用（新增 / Block / 删除）。

Vite 已将 `/api` 代理到 `http://127.0.0.1:8000`。

## 建议验收路径

详见 [docs/webui-nhx-usage.zh-CN.md](../docs/webui-nhx-usage.zh-CN.md) 第 10 节。摘要：

### 组织 HX

1. 登录 → **初始配置生成**
2. **Profile / Stage&Task / Guide&Sensor / Command** 查看与编辑（Task 直接绑 Sensor，含 `human`）
3. **设置** 填写组织 GitHub 仓库与 Token
4. **GitHub 推送**

### 项目 HX

1. **项目列表** 创建并 **初始化配置**
2. 成员、产物、自定义 Task（可编辑绑定）、Sensor（可设 human）
3. **审批工单**（`human-check`）→ 提交 → 批准
4. **GitHub 同步**

### nhx

```bash
nhx login
nhx init --project 1 --stages req,dev
nhx submit ./docs/prd.md --name prd --stage req --task prd-writing
nhx approve request --stage req --task prd-writing
```

## 对照原型页面

| 原型 | WebUI 路由 |
|------|------------|
| `wui-design/hx-maintenance-system.html` | `/org/*` |
| `wui-design/project-hx-maintenance-system.html` | `/project/*` |

## API 概览

- `POST /api/auth/login` · `POST /api/auth/register` · `GET /api/auth/me`
- `GET/POST /api/org/users` · `PATCH /api/org/users/{id}/active` · `DELETE /api/org/users/{id}`（`org_admin`）
- `POST /api/org/bootstrap` · CRUD profiles/tasks/guides/sensors/commands
- `PUT /api/org/tasks/{id}` · 更新任务 Guide/Sensor 绑定
- `POST /api/org/export-hub` · `/api/org/github/push`
- CRUD `/api/projects` · members · init-config · guides/sensors/tasks
- `PUT /api/projects/{id}/tasks/{id}` · 更新项目任务绑定
- `GET /api/projects/{id\|slug}/export` · nhx 拉资产
- `POST /api/artifacts` · versions
- CRUD `/api/tickets` · submit/approve/reject
- `GET /api/tickets/approval-status` · nhx human Sensor
- `POST /api/projects/{id}/github/sync`

## 与 nhx / hx 的边界

| 能力 | 归属 |
|------|------|
| 组织/项目配置、审批、产物、GitHub 运维 | 本 WebUI |
| 本机 init、IDE 投影、Sensor 检查、提交产物、发起人工审批 | **`nhx`**（见使用手册） |
| 传统门禁/编排/Hub CLI | 现有 `hx` / `hxhub`（互不影响） |
