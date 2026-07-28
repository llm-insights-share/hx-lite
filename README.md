# hx-lite (WebUI + nhx)

当前仓库已收敛为 **WebUI 管理端 + nhx 交付 CLI** 主线；历史能力与文档已迁移到 `archive/` 目录。

## 文档入口

- [WebUI + nhx 使用手册](docs/webui-nhx-usage.zh-CN.md)
- [nhx 使用手册](packages/nhx/README.md)
- [架构说明（key-design）](docs/architecture/key-design.zh-CN.md)

## 快速开始

```bash
git clone https://github.com/llm-insights-share/hx-lite.git
cd hx-lite
npm install
npm install -g .
nhx --help
```

## WebUI 启动

```bash
cd webui
./start.sh
```
