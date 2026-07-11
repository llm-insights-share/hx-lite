# HarnessX

**[English](./README.en.md)** · 中文

> 让 AI 编程 Agent 可靠交付生产级软件的外层控制平面 —— 不是又一个测试框架，而是 **规格驱动 + 前馈 Guide + 反馈 Sensor + fail-closed Gate** 的完整交付 Harness。

[![Version](https://img.shields.io/badge/version-0.6.0-blue)](docs/releases/v0.6.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

---

## 为什么需要 HarnessX？

Cursor / Claude Code / Codex 能写代码，但**不能**保证：需求没跑偏、架构没腐化、测试没自嗨、多人协作没冲突。

HarnessX 把 AI 交付当作**控制工程问题**来解：在每个 stage/task 给 Agent 精准上下文（Guide），在每个节点用 Sensor 验收（fail-closed），失败则带 `fix_hint` 驱动自校正 —— 把「AI 写代码」变成「AI 在 Harness 里交付」。

**如果这个项目对你有帮助，欢迎 Star ⭐ 支持我们继续迭代。**

---

## 核心能力（v0.6）

| 能力 | 一句话 |
| --- | --- |
| **四阶段交付** | `req` → `arch` → `dev` → `test`，组织级 PRD/架构 + Change 级开发测试 |
| **Guide + Sensor 双环** | 做事前注入规范与模板，做事后用 lint/测试/规格/AI Review 验收 |
| **Fail-closed Gate** | Sensor 崩溃、超时、不可解析 —— 一律阻断，不允许静默通过 |
| **Steering 自进化** | 重复失败沉淀为 Skill / Rubric / 模板，Harness 越用越准 |
| **多工具单源** | 一套资产编译到 Cursor、Claude Code、Trae、Qoder 等 |
| **Hub 资产供应链** | 组织级 Skill/Bundle/Blueprint 发布、评审、锁定与消费 |

兼容 [OpenSpec](https://github.com/Fission-AI/OpenSpec) Delta Spec；可与现有 CI 并存，本地 hooks + 远程 CI 双重 enforcement。

---

## 30 秒上手

```bash
git clone https://github.com/llm-insights-share/harnessX.git && cd harnessX
npm install && npm link    # 全局可用 hx / hxhub

hx init --bundle api-service --adapter cursor
hx hooks install && hx adapter sync

hx change create my-feature --domains api
hx propose my-feature --title "你的第一个功能"
hx gate check my-feature --stage dev --task propose
# 在 Cursor 里 /hx-propose → design → apply → verify → archive
```

**企业全路径**（req/arch/dev/test + 工单）：`hx init --from-hub enterprise-sdlc@1.0.0 --hub <your-hub>`

---

## 适用谁？

- **团队 Tech Lead** — 统一 AI 交付流程，PR 不再「Agent 自由发挥」
- **平台 / 效能工程师** — Hub 资产治理、`hxhub` 运维、CI 强制
- **架构师** — 组织级 PRD/HLD/LLD 与 Change 设计对齐
- **个人开发者** — `lite` profile 快速 hotfix，或用 Cursor 斜杠命令驱动全流程

---

## 文档

| 文档 | 说明 |
| --- | --- |
| [使用说明（中文）](docs/usage-guide.zh-CN.md) | 概念、初始化、定制 |
| [操作说明（中文）](docs/operation-guide.zh-CN.md) | 按 stage 的命令与配置 |
| [开发人员应用交付使用手册](docs/dev-manual.zh-CN.md) | dev 阶段交付、前后端多人协同 |
| [产品经理需求文档编写使用手册](docs/pm-req-manual.zh-CN.md) | 组织级 PRD 编写与批准 |
| [架构师概要设计使用手册](docs/arch-hld-manual.zh-CN.md) | 组织级 HLD/LLD |
| [hxhub 使用手册](docs/hxhub-usage.zh-CN.md) | Hub 资产创建、发布与治理 |
| [20 个场景示例](docs/examples/README.md) | 从入门到企业 SDLC 的 walkthrough |
| [四阶段模型权威定义](docs/delivery-stages.zh-CN.md) | stage / task 清单 |
| [English usage guide](docs/usage-guide.en.md) | English documentation |

---

## 开发

```bash
npm run verify    # typecheck + tests
```

MIT License · 设计文档：[harness-delivery-system-design.html](docs/harness-delivery-system-design.html)
