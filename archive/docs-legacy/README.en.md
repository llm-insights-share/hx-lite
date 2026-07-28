# HarnessX

English · **[中文](./README.md)**

> The **outer control plane** that makes AI coding agents ship production software reliably — not another test runner, but a spec-driven harness with **Guides (feedforward)**, **Sensors (feedback)**, and **fail-closed Gates**.

[![Version](https://img.shields.io/badge/version-0.4.0-blue)](https://github.com/llm-insights-share/hx-lite)
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
| **Profile → Stage → Task** | `lite`/`standard`/`strict`/`enterprise`; assets bind to tasks |
| **Steering loop** | Recurring failures become Skills, rubrics, and templates over time |
| **Multi-tool, single source** | One asset set compiles to Cursor, Claude Code, Trae, Qoder, … |
| **Hub supply chain** | Pull guide/sensor packages by profile into the project repo via `hxhub` |
| **CLI navigation** | `hx doctor` / `hx next` / `hx tui` — workspace-context health check and next-step guidance ([cli-reference](docs/cli-reference.zh-CN.md)) |

OpenSpec-compatible Delta Specs. Works alongside existing CI — local hooks plus remote replay.

---

## Quick start (30 seconds)

```bash
git clone https://github.com/llm-insights-share/hx-lite.git && cd hx-lite
npm install && npm link    # hx / hxhub available globally

hxhub seed ./harness-hub --profile standard --scenario core
hx project create --profile standard --hub ./harness-hub --adapter cursor
hx hooks install && hx adapter sync

# After pull: pick local stages
hx init --stages req,dev

hx change create my-feature --domains api
hx propose my-feature --title "Your first feature"
hx gate check my-feature --stage dev --task propose
```

**Enterprise path**: `hx project create --profile enterprise --hub <your-hub>` (see Chinese delivery manual).

---

## Who is it for?

- **Tech leads** — one AI delivery workflow; PRs stop being “agent freestyle”
- **Platform / DevEx** — Hub governance, `hxhub` ops, CI enforcement
- **Architects** — org PRD/HLD/LLD aligned with change-level design
- **Individual devs** — `lite` profile for hotfixes, or full Cursor slash-command flow

---

## Documentation

Primary manuals are Chinese (latest design). English stubs redirect here.

| Doc | Description |
| --- | --- |
| [Enterprise AI delivery manual (ZH)](docs/enterprise-delivery.zh-CN.md) | By role: PM / tech manager / architect / dev / QA |
| [hxhub manual (ZH)](docs/hxhub-usage.zh-CN.md) | Hub asset create, publish, governance |
| [Four-stage model (ZH)](docs/delivery-stages.zh-CN.md) | Authoritative stage/task list |
| [Stage-task asset matrix (ZH)](docs/stage-task-assets.zh-CN.md) | Command / Skill / Template / Suite / Sensor per task |
| [Glossary](docs/glossary.md) | Terminology |
| [Scenario walkthroughs](docs/examples/en/README.md) | Onboarding → enterprise SDLC |

---

## Development

```bash
npm run verify    # typecheck + tests
```

MIT License · Design doc: [harness-delivery-system-design.html](docs/harness-delivery-system-design.html)
