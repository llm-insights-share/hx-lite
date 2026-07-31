# HX-lite   组织AI交付管理框架

组织可控交付工作台：**WebUI 做组织治理，nhx 做本地执行**。

你可以把 `hx-lite` 理解为一条完整交付链路：组织在 WebUI 里维护规则和资产，项目通过 `nhx` 同步并落地执行，整个过程可追踪、可复盘、可复用。

## 为什么有 HX-lite

AI 编程工具让“写代码”更快了，但团队交付仍常在这些地方断掉：

- 需求传递不稳定：目标、边界、验收口径在链路中逐步失真
- 组织资产分散：规范、模板、检查规则难以跨项目复用
- 过程不可审计：关键决策与变更缺少统一记录与回看能力
- 多角色协作割裂：产品、架构、开发、测试缺少共享控制面

`hx-lite` 的做法不是继续堆命令，而是建立统一闭环：

- WebUI 负责组织级资产治理（Stage/Task、Guide、Sensor）
- `nhx` 负责项目级同步、投影与本地执行
- 组织治理与开发执行共用同一套规则和状态

## 快速开始（30 秒）

```bash
git clone https://github.com/llm-insights-share/hx-lite.git
cd hx-lite
npm install
npm install -g .
nhx --help
```

启动 WebUI：

```bash
cd webui
./start.sh
```



## 设计理念

- **组织中心化**：组织统一维护交付资产，项目侧只做初始化和增量同步。
- **资产优先**：先定义可复用的 Guide/Sensor，再由流程编排承载。
- **执行可追踪**：关键操作留痕，支持审计、复盘与责任定位。
- **前后端闭环**：WebUI 治理与 `nhx` 执行通过 API 与项目配置联动。
- **渐进式演进**：主线保持精简，历史能力归档到 `archive/`。



## 推荐阅读顺序

1. [WebUI + nhx 使用手册](docs/webui-nhx-usage.zh-CN.md)
2. [nhx CLI 手册](packages/nhx/README.md)
3. [nhx 命令详解](docs/nhx-command-manual.zh-CN.md)
4. [交付系统设计说明（HTML）](docs/harness-delivery-system-design.html)



## 仓库边界说明

- 当前主线：`WebUI + nhx`
- 历史能力与旧文档：`archive/`

