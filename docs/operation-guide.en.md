# HarnessX Operation Guide

**中文**: [操作说明（中文）](operation-guide.zh-CN.md)

This guide explains how to use HarnessX (`hx` CLI) with AI coding agents in day-to-day delivery. For end-to-end walkthroughs tied to real scenarios, see [`docs/examples/en/`](examples/en/README.md).

## 1. Prerequisites

```bash
git clone <your-repo>
cd <your-repo>
npm install
```

Examples use `hx` as shorthand for `node bin/hx.js` (or a globally installed `hx`).

## 2. Initialize a project

### English scaffold (default)

```bash
hx init --bundle api-service
```

### Chinese scaffold (hx-cn)

```bash
hx init --locale hx-cn --bundle api-service-cn
```

`--locale hx-cn` installs Chinese assets:

| Asset | Description |
| --- | --- |
| `constitution.md` | Project constitution in Chinese |
| `assets/commands/*.md` | Eight phase workflow prompts for `/hx-*` slash commands |
| `assets/guides/proposal-template/` | Chinese proposal template and example |
| `assets/guides/design-template/` | Chinese design template and example |
| `assets/guides/spec-writing/` | Chinese EARS spec-writing skill |
| `assets/guides/coding-conventions/` | Chinese coding conventions skill |
| `harness.yaml` | Chinese `fix_hint` strings and asset registry |

`config.yaml` sets `locale: zh-CN`. Scaffolds from `hx propose`, `hx design`, and `hx explore` are also localized.

After init, run:

```bash
hx hooks install    # local git hooks
hx ci init          # GitHub Actions workflow
hx adapter sync     # compile to .cursor/ and other tool dirs
```

### Initialize from Harness Hub (v0.3 recommended)

When a platform team maintains a central Hub, application repos can pull **topology bundles** or **delivery blueprints**:

```bash
hx hub seed ./harness-hub                    # first time: create Hub from golden packages (platform team)
hx init --from-hub api-service@1.0.0 --hub ./harness-hub
hx init --from-hub enterprise-delivery@1.0.0 --hub ./harness-hub --adapter cursor
hx init --from-hub frontend-2c@1.0.0 --hub ./harness-hub
```

`--from-hub` scaffolds `harnessX/`, installs Hub packages into `.hub-cache/`, writes `harness.lock`, and records the `hub` path in `config.yaml`. See scenario [16](examples/en/16-v0.3-hub-blueprint-init.md).

`harnessX/blueprint.yaml` describes the delivery path (profile, Hub dependencies). Combine with `hx-cn`: `hx init --locale hx-cn --from-hub api-service@1.0.0 --hub ./harness-hub`.

## 3. Two operation entry points

HarnessX separates the **control plane** from the **execution plane**:

| Entry | Use for | Examples |
| --- | --- | --- |
| **Terminal** | human approval, gate advance, waivers, archive | `hx gate approve`, `hx gate advance` |
| **Cursor dialog** | agent drafts proposals, specs, code, self-correction | `/hx-propose`, `/hx-apply` |

Rule of thumb: **let the agent do what it can in Cursor; reserve the terminal for human-only actions** — those are also the audit trail.

Run `hx adapter sync` before using slash commands in Cursor. Type `/` to see `hx-explore` … `hx-archive`; each command body is the full workflow for that phase.

## 4. Standard delivery loop

Using the `standard` profile (`lite` / `strict` — see scenarios 03 and 05):

```
explore → propose → design → spec → [human approval] → plan → apply → verify → archive
```

### 4.1 Create a change

```bash
hx change create add-refund --domains orders,payments
```

Declare `touched domains`; overlaps with other active changes produce warnings.

### 4.2 Propose — proposal and initial delta spec

**Terminal** (scaffold only):

```bash
hx propose add-refund --title "Support partial refunds"
```

**Cursor**: run `/hx-propose` and follow the workflow prompt to fill `proposal.md` and delta specs.

Validate:

```bash
hx gate check add-refund --phase spec
```

### 4.3 Design — technical design

```bash
hx design add-refund          # writes design.md (hx-cn uses design-template)
hx gate advance add-refund    # advance after design gate passes
```

Or use `/hx-design` in Cursor.

### 4.4 Spec — finalize specs and human approval

Use `/hx-spec` in Cursor to tighten EARS requirements and scenario coverage.

**Human only** (agents must not run this):

```bash
hx gate approve add-refund --gate spec --approver alice
hx gate advance add-refund
```

### 4.5 Plan — task breakdown

```bash
hx plan add-refund
```

Produces `tasks.md`: one `[test]` and one `[impl]` task per scenario. Review ordering with `/hx-plan` in Cursor.

### 4.6 Apply — implementation

```bash
hx apply add-refund --runner "<your agent command>"
# v0.2: parallel and best-of-N
hx apply add-refund --parallel 2 --runner "<agent>"
hx apply add-refund --fan-out 3 --runner "<agent>"
```

Or `/hx-apply` in Cursor, one task at a time. Fast sensor suite must pass after each task.

With weaker IDE adapters (Codex/OpenCode), `hx adapter sync --targets codex,generic` writes `.harnessx-adapter-tier`; Tier 2 automatically strengthens gate checks. Prefer headless `hx apply --runner "<agent>"` for reliable feedback.

### 4.7 Verify — full verification

```bash
hx verify add-refund
```

Runs the full sensor suite and scenario→test traceability. On failure, use `hx fix add-refund` for a focused repair pack.

### 4.8 Archive — merge specs

```bash
hx rebase check add-refund   # pre-flight against other changes
hx archive add-refund        # merge deltas into main specs and archive
```

## 5. Command quick reference

| Command | Purpose |
| --- | --- |
| `hx status` | Active changes and gate state |
| `hx gate check <id> [--phase <p>]` | Run sensor suite for a phase |
| `hx gate advance <id>` | Advance to next phase (sensors green + preconditions) |
| `hx gate approve <id> --gate spec --approver <name>` | Record human spec approval |
| `hx guide pack <id> --phase <p>` | Assemble Context Pack for a phase |
| `hx guide task-pack <id> <taskId>` | Assemble single-task handoff pack for apply (`HX_TASK_PACK`) |
| `hx harness lint` | Detect constitution vs skill conflicts |
| `hx bundle list` | List topology bundles (`api-service`, `frontend-dashboard`, `frontend-2c`, `library-sdk`, `serverless-function`, `mobile-app`, `data-pipeline`, plus `*-cn`) |
| `hx bundle add <id>` | Apply an additional topology bundle after init |
| `hx waiver add <id> --sensor <s> --reason "..." --expires YYYY-MM-DD` | Time-boxed waiver |
| `hx adapter sync` | Compile harnessX assets to AI tool directories |
| `hx steer report` | Recurring failures → candidate new guides |
| `hx hub golden` | List built-in golden Hub packages (package / bundle) |
| `hx hub seed [path]` | Create a hub repo from golden packages |
| `hx hub add <id>@<ver> --hub <path>` | Install Hub package into `.hub-cache/` |
| `hx hub sync --hub <path> [--apply]` | Report upstream drift; `--apply` three-way merges local overrides |
| `hx hub search [q] --hub <path>` | Search Hub catalog by keyword/kind/phase (v0.4) |
| `hx hub eval <pkg> --hub <path>` | Pre-publish validation of a Hub package |
| `hx steer publish <dir> --hub <path> --by <name>` | Metrics → eval → promote closed loop |
| `hx steer coverage [--aggregate <dir>]` | Per-repo or cross-repo Harness Coverage (v0.4) |
| `hx bundle list [--hub <path>]` | List built-in or Hub topology bundles |
| `hx view [--out file]` | Delivery dashboard (phase funnel + asset effectiveness, v0.4) |
| `hx sync` | Spec↔code drift; verify phase also runs unified `drift` sensor |

## 6. Core mental model

1. All behaviour changes live in a **change workspace** (`harnessX/changes/<id>/`), described by delta specs.
2. Progress uses **Gates**: `hx gate advance` only when sensors pass and preconditions hold (e.g. human approval); sensor crashes block (fail-closed).
3. Agent input comes from **Guides/Context Packs**; output is checked by **Sensors**; failures include `fix_hint` for the `hx fix` loop.
4. `hx archive` merges deltas into main specs — the single source of truth for system behaviour.
5. Recurring failures feed **Steering** → new guides, shared via **Hub** — the harness evolves.

## 7. v0.3 / v0.4 layered architecture at a glance

| Layer | v0.3+ capability | Typical commands |
| --- | --- | --- |
| **Hub assets** | Package/bundle/blueprint distribution, search, eval, sync merge | `init --from-hub`, `hub search`, `hub sync --apply` |
| **HX orchestration** | Blueprint delivery path, tier compensation, drift & UAT gates | `blueprint.yaml`, `drift` sensor, `uat-complete` |
| **IDE execution** | codex/opencode adapters + stronger L3 checks | `adapter sync --targets codex,generic` |

The enterprise profile adds in v0.4: `prototype-complete` (design gate), `uat-complete` (verify gate), and unified `drift` sensor. The api-service bundle includes `integration-smoke` (runs when `npm run test:integration` exists).

## 8. Further reading

- [17 usage scenario walkthroughs](examples/en/README.md)
- [System design document](harness-delivery-system-design.html) (Chinese)
- [Build plan & status](build-plan.csv)
- Repository [README.md](../README.md)
