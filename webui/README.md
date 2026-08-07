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
