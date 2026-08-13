# HX-lite <img src="webui/frontend/public/logo.svg" alt="hx-lite logo" width="32" /> — 组织级 AI 交付管理框架

> **一句话定义**：HX-lite 是一个企业级 Harness 控制框架，通过「WebUI 组织治理 + nhx 本地执行」的双层架构，让 AI 辅助编程（Vibe Coding）在团队/组织范围内变得可控、可审计、可复用。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## What is HX-lite? (English Summary)

HX-lite is an enterprise Harness control framework for AI-assisted software delivery ("Vibe Coding"). It solves four common failure modes in AI-driven engineering teams:

- Requirements drift as they pass through the delivery chain
- Organizational assets (standards, templates, review rules) that can't be reused across projects
- Untraceable decisions and changes during AI-assisted development
- Disconnected roles (PM / architect / dev / QA) with no shared control plane

**Architecture**: a central **WebUI** governs organization-level assets (Stage/Task definitions, Guides, Checks), while the **`nhx` CLI** syncs those assets into individual projects and executes them locally. Both share the same rule and state model, forming a closed loop between governance and execution.

Core primitives:
| Concept | Role |
|---|---|
| **Guide** | A reusable, organization-defined standard or template (feed-forward control); templates may be markdown or packages (`.docx` / `.xlsx`, …) |
| **Check** | A validation rule that observes execution and reports back (feedback control); paths should match the deliverable extension hinted by the bound template |
| **Stage / Task** | The unit of work that Guides and Checks attach to |
| **nhx** | The local CLI that projects use to pull org assets (including template packages) and execute them |

---

## 为什么有 HX-lite

AI 编程工具让"写代码"更快了，但团队交付仍常在这些地方断掉：

- **需求传递不稳定**：目标、边界、验收口径在链路中逐步失真
- **组织资产分散**：规范、模板、检查规则难以跨项目复用
- **过程不可审计**：关键决策与变更缺少统一记录与回看能力
- **多角色协作割裂**：产品、架构、开发、测试缺少共享控制面

HX-lite 的做法不是继续堆命令，而是建立统一闭环：

- WebUI 负责组织级资产治理（Stage/Task、Guide、Check）
- `nhx` 负责项目级同步、投影与本地执行
- 组织治理与开发执行共用同一套规则和状态

---

## 常见问题 (FAQ)

**Q: HX-lite 和普通的 AI coding 工具（Copilot / Cursor）有什么区别？**
A: HX-lite 不替代具体的编码工具，而是在其之上提供组织级的治理层——统一的规范同步、执行留痕、审计能力，解决"多人多项目用 AI 编程后如何统一管控"的问题。

**Q: 什么是 Guide 和 Check？**
A: Guide 是组织预先定义的可复用标准/模板（前馈控制，告诉 AI "应该怎么做"），Template 可为 markdown 或 Word/Excel 等 package；Check 是执行过程中的检查规则（反馈控制，验证"是否做对了"）。产物扩展名跟随绑定 template 主文件，门禁路径需一致。两者共同构成闭环。（历史上曾称 Sensor，产品与文档统一为 Check；本地目录 `.nhx/sensors/` 与 `nhx sensor check` 仅为兼容。）

**Q: 项目侧需要做什么？**
A: 项目侧只需初始化并通过 `nhx` 增量同步组织资产（含 package 模版文件），无需重复搭建规范体系。

**Q: 适合什么规模的团队使用？**
A: 面向已有一定规模、需要跨项目复用交付规范并要求过程可审计的企业研发团队，而非单人项目。

---

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

---

## 支持的 IDE（nhx adapter）

`nhx` 通过 `--targets` 将 Command / Skill 壳投影到各 IDE。默认 `cursor,trae`；其余需显式指定。

| `--targets` | IDE | Command | Skill | Hooks 配置 | 项目级目录 | 全局目录（`--global`） |
|-------------|-----|---------|-------|------------|------------|------------------------|
| `cursor` | Cursor | ✓ | ✓ | `.cursor/hooks.json` | `.cursor/` | `~/.cursor/` |
| `trae` | Trae（国际版） | —（投影为 Skill） | ✓ | `.trae/hooks.json` | `.trae/` | `~/.trae/` |
| `trae-cn` | Trae（中国版） | —（投影为 Skill） | ✓ | `.trae/hooks.json` | `.trae-cn/`（skills） | `~/.trae-cn/` |
| `codebuddy` | CodeBuddy | ✓ | ✓ | `.codebuddy/settings.json` | `.codebuddy/` | `~/.codebuddy/` |
| `workbuddy` | WorkBuddy | ✓ | ✓ | `.codebuddy/settings.json`（项目） | `.codebuddy/` | `~/.workbuddy/` |
| `qoder` | Qoder | ✓ | ✓ | `.qoder/settings.json` | `.qoder/` | `~/.qoder/`（或 `$QODER_CONFIG_DIR`） |
| `qoderwork` | QoderWork | ✓ | ✓ | `.qoder/settings.json`（项目） | `.qoder/` | `~/.qoderwork/` |

示例：

```bash
nhx adapter sync --targets cursor,trae,qoder,qoderwork
nhx init --project 1 --stages req --targets cursor,trae,codebuddy,workbuddy,qoder,qoderwork
```

更细的投影路径与 Hook 事件见 [nhx CLI 手册](./packages/nhx/README.md)。

---

## 设计理念

- **组织中心化**：组织统一维护交付资产，项目侧只做初始化和增量同步
- **资产优先**：先定义可复用的 Guide/Check，再由流程编排承载
- **执行可追踪**：关键操作留痕，支持审计、复盘与责任定位
- **前后端闭环**：WebUI 治理与 `nhx` 执行通过 API 与项目配置联动
- **渐进式演进**：主线保持精简，历史能力归档到 `archive/`

---

## 推荐阅读顺序

1. [WebUI + nhx 使用手册](./docs/webui-nhx-usage.zh-CN.md)（含 Guide package / 产物扩展名）
2. [nhx CLI 手册](./packages/nhx/README.md)
3. [nhx 命令详解](./docs/nhx-command-manual.zh-CN.md)
4. [Guide 类型与样例](./docs/guide-kinds-harness-samples.zh-CN.md)
5. [交付系统设计说明（HTML）](./docs/harness-delivery-system-design.html)
6. [WebUI 启停](./webui/README.md)

## 仓库边界说明

- 当前主线：`WebUI + nhx`
- 历史能力与旧文档：`archive/`

## Citation

如果你在文章/研究/工具评测中引用本项目，请参考 [CITATION.cff](./CITATION.cff)。

---

License: MIT
