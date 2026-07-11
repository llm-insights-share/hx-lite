# HarnessX

English · **[中文](./README.md)**

> The **outer control plane** that makes AI coding agents ship production software reliably — not another test runner, but a spec-driven harness with **Guides (feedforward)**, **Sensors (feedback)**, and **fail-closed Gates**.

[![Version](https://img.shields.io/badge/version-0.6.0-blue)](docs/releases/v0.6.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

---

## Why HarnessX?

Cursor, Claude Code, and Codex can write code — they cannot guarantee aligned requirements, stable architecture, trustworthy tests, or safe multi-agent collaboration.

HarnessX treats AI delivery as a **control-engineering problem**: inject the right context per stage/task (Guides), validate every step with Sensors (fail-closed), and feed structured `fix_hint` back to the agent when checks fail.

**If this project helps you, please star the repo ⭐ — it keeps us building.**

---

## What you get (v0.6)

| Capability | In one line |
| --- | --- |
| **Four-stage delivery** | `req` → `arch` → `dev` → `test` — org PRD/architecture + per-change dev & test |
| **Guide + Sensor dual loop** | Skills/templates before action; lint/tests/spec/AI review after |
| **Fail-closed gates** | Crashed, timed-out, or unparseable sensors **block** — never silent pass |
| **Steering loop** | Recurring failures become Skills, rubrics, and templates over time |
| **Multi-tool, single source** | One asset set compiles to Cursor, Claude Code, Trae, Qoder, … |
| **Hub supply chain** | Publish, review, lock, and consume org-wide assets via `hxhub` |

OpenSpec-compatible Delta Specs. Works alongside existing CI — local hooks plus remote replay.

---

## Quick start (30 seconds)

```bash
git clone https://github.com/llm-insights-share/harnessX.git && cd harnessX
npm install && npm link    # hx / hxhub available globally

hx init --bundle api-service --adapter cursor
hx hooks install && hx adapter sync

hx change create my-feature --domains api
hx propose my-feature --title "Your first feature"
hx gate check my-feature --stage dev --task propose
# In Cursor: /hx-propose → design → apply → verify → archive
```

**Enterprise path** (req/arch/dev/test + work orders): `hx init --from-hub enterprise-sdlc@1.0.0 --hub <your-hub>`

---

## Who is it for?

- **Tech leads** — one AI delivery workflow; PRs stop being “agent freestyle”
- **Platform / DevEx** — Hub governance, `hxhub` ops, CI enforcement
- **Architects** — org PRD/HLD/LLD aligned with change-level design
- **Individual devs** — `lite` profile for hotfixes, or full Cursor slash-command flow

---

## Documentation

| Doc | Description |
| --- | --- |
| [Usage guide (EN)](docs/usage-guide.en.md) | Concepts, init, customization |
| [Operation guide (EN)](docs/operation-guide.en.md) | Commands by stage |
| [Developer manual (ZH)](docs/dev-manual.zh-CN.md) | Dev delivery and multi-role collaboration |
| [hxhub manual (ZH)](docs/hxhub-usage.zh-CN.md) | Hub asset create, publish, governance |
| [20 scenario walkthroughs](docs/examples/en/README.md) | Onboarding → enterprise SDLC |
| [Four-stage model (ZH)](docs/delivery-stages.zh-CN.md) | Authoritative stage/task list |
| [使用说明（中文）](docs/usage-guide.zh-CN.md) | Chinese documentation |

---

## Development

```bash
npm run verify    # typecheck + tests
```

MIT License · Design doc: [harness-delivery-system-design.html](docs/harness-delivery-system-design.html)
