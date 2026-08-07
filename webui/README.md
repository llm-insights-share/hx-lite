# HX WebUI

组织 / 项目 HX 维护控制台：Stage·Task、Guide·Check、壳编辑器、产物与审批工单。

## 启停

```bash
cd webui
./start.sh          # 后端 :8000 + 前端 :5173
./status.sh
./stop.sh
```

| 项 | 默认 |
|----|------|
| 前端 | <http://127.0.0.1:5173> |
| API | <http://127.0.0.1:8000> |
| 账号 | `admin` / `admin123` |

常用环境变量：`HX_WEBUI_GITHUB_TOKEN`、`HX_WEBUI_ADMIN_*`、`HX_WEBUI_DATABASE_URL`、`HX_WEBUI_BACKEND_PORT`、`HX_WEBUI_FRONTEND_PORT`。

## 内置种子（组织 Catalog + 演示项目）

仓库内 [`backend/seed/org-default/`](backend/seed/org-default/) 携带组织 Profile / Stage·Task / Guide（含 package）/ Check / CommandShell，以及演示项目（`demo-project`、`second-project`、`demo-app`、`demo2`）。

- **空库首次启动**：自动导入组织 Catalog，并幂等创建缺失的演示项目。
- **工具 → 初始配置生成**：优先按种子重置组织 Catalog；演示项目只补齐缺失项，不覆盖已有同 slug 项目。
- **刷新种子**（从当前运行库导出）：

```bash
cd webui/backend
.venv/bin/python scripts/export_org_seed.py
```

## Guide package

Template Guide 支持 **package** 模式（docx / xlsx / md 等）。上传后：

- 任务壳附录提示主文件与产物扩展名
- 项目「初始化 / 重新初始化」或本地 `nhx sync` 将包文件同步到 `.nhx/guides/<asset_id>/`
- Check（如 `file.exists`）路径应与建议文件扩展名一致

详见 [docs/webui-nhx-usage.zh-CN.md](../docs/webui-nhx-usage.zh-CN.md) §3.2.1。

## 相关文档

- [WebUI + nhx 使用手册](../docs/webui-nhx-usage.zh-CN.md)
- [nhx CLI](../packages/nhx/README.md)
- [Guide 类型样例](../docs/guide-kinds-harness-samples.zh-CN.md)
