# hx-lite (WebUI + nhx)

当前仓库已收敛为 **WebUI 管理端 + nhx 交付 CLI** 主线；历史能力与文档已迁移到 `archive/` 目录。

## hx-lite 要解决的问题

AI 编程工具提升了生成速度，但在团队落地时常见几个断点：

- 需求与实现脱节：任务目标、边界条件、验收标准难以稳定传递
- 组织资产难复用：规范、模板、检查规则散落，项目间难同步
- 交付过程不可追溯：谁在什么时候做了什么改动，缺少统一日志视角
- 多角色协作成本高：产品、架构、开发、测试在同一变更链路上缺少公共控制面
- 本地执行与组织治理割裂：开发侧操作和组织侧资产管理没有一体化闭环

hx-lite 的目标是把这些问题收敛到一套可执行链路：组织在 WebUI 治理资产，项目通过同步保持一致，成员用 nhx 在本地按同一规则交付。

## 设计理念

围绕“可控交付”而不是“更多命令”，核心理念如下：

- **组织中心化**：组织侧维护 Profile、Stage/Task、Guide/Sensor，项目侧只做初始化与增量同步
- **前后端双闭环**：WebUI 负责治理与可视化；nhx 负责执行与投影，二者通过 API 和项目配置打通
- **资产优先于流程**：优先定义可复用资产（Guide/Sensor），流程只是资产的编排与承载
- **默认可审计**：关键写操作记录项目操作日志，保证变更可追踪、可复盘
- **渐进式收敛**：保留历史能力到 `archive/`，当前主线只保留 WebUI + nhx，降低维护复杂度
- **适配真实团队协作**：支持组织治理与项目交付分层，兼顾管理视角与开发者本地体验

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
