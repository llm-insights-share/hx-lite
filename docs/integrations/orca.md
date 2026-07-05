# HarnessX + Orca Integration (v0.2)

HarnessX and [Orca](https://github.com/stablyai/orca) solve different layers of the same problem:

| Layer | Tool | Responsibility |
|-------|------|----------------|
| **Control plane** | HarnessX | Specs, gates, sensors, traceability, steering |
| **Execution plane** | Orca | Parallel agents, worktrees, terminals, diff review UI |

Use them together: **Orca runs the agents; HarnessX decides when they may advance.**

## Recommended workflow

### 1. Initialize HarnessX in your repo

```bash
hx init --bundle api-service
hx change create add-auth --domains auth
hx propose add-auth --title "Session expiry"
```

### 2. Fan-out apply with Orca parallel worktrees

When a change is planned and gated, run multiple agent attempts and let HarnessX pick the winner:

```bash
# HarnessX creates N isolated git worktrees and scores verify results
hx apply add-auth --fan-out 3 --runner "claude -p 'implement HX_TASK'"
```

Results are recorded in `harnessX/changes/add-auth/runtime.yaml` under `fanOut.candidates`.

Alternatively, create worktrees manually and map them in Orca:

```bash
hx runtime worktree create add-auth --slot orca-1
hx runtime worktree create add-auth --slot orca-2
hx runtime worktree list add-auth
```

Open each worktree path in Orca as a separate tab. Run `hx apply add-auth` inside each. Merge the worktree whose `hx verify add-auth` passes first.

### 3. Diff annotations → fix hints

After reviewing AI diffs in Orca, export line comments to JSON and feed them back into apply:

```bash
hx review import add-auth reviews/orca-add-auth.json
hx apply add-auth --runner "<agent>"   # HX_FIX_HINTS includes annotation text
```

Orca-compatible JSON shape:

```json
[
  {
    "file": "src/auth.ts",
    "line": 42,
    "severity": "critical",
    "comment": "Must check token expiry before decode"
  }
]
```

Resolve when addressed:

```bash
hx review resolve add-auth ann-1
```

### 4. Watch long-running Quest / Orca sessions

```bash
hx watch add-auth --once                    # file-save sensor daemon is `hx watch`; use notify for change events
hx notify add-auth --once
hx notify add-auth --webhook https://hooks.example/hx
export HX_WATCH_WEBHOOK=https://hooks.example/hx
hx notify add-auth                           # poll every 30s until Ctrl+C
```

Events: `needs_approval`, `tasks_complete`, `review_pending`, `status_change`.

### 5. Orca CLI scripting

Orca exposes `orca worktree create`, `snapshot`, etc. A typical scripted loop:

```bash
# In Orca terminal inside a HarnessX worktree
hx gate advance my-change
hx plan my-change
hx apply my-change --parallel 2 --runner "codex exec"
hx verify my-change
```

HarnessX remains the **only path to mainline**: however Orca agents work inside worktrees, merge requires green `hx verify`.

## Parallel tasks within one worktree

Annotate `tasks.md` with groups and dependencies:

```markdown
- [ ] 01a [test] (auth / Requirement: X) Write test @group=g1
- [ ] 02a [test] (auth / Requirement: Y) Write test @group=g1
- [ ] 01b [impl] (auth / Requirement: X) Implement @depends=01a
```

```bash
hx apply my-change --parallel 2 --runner "<agent>"
```

Tasks in the same `@group` run concurrently (up to `--parallel`); `@depends` enforces ordering across groups.

## Guide behavior evals (quality gate for prompts)

Before promoting harness assets:

```bash
hx eval guides my-change
hx eval guides my-change --cases evals/custom-cases.json
```

Bundled cases live in `packages/core/evals/guide-behavior.json`.

## GitHub issue → change (with Orca task picker)

```bash
hx change create fix-login --from-issue https://github.com/org/repo/issues/42
```

Creates the change workspace, scaffolds `proposal.md` from the issue, and opens a delta spec draft. Open the resulting worktree in Orca from the linked Linear/GitHub task.

## Division of responsibility

```text
Orca                          HarnessX
──────────────────────────────────────────────────
Multi-agent terminals         Phase gates + sensors
Worktree UI                   Spec truth + traceability
Diff annotation UI            review-annotations.yaml
Mobile notifications          hx notify webhooks
Agent-agnostic CLI            hx adapter sync (Cursor/Claude/…)
```

**Rule of thumb:** if it is about *how agents run in parallel*, use Orca; if it is about *whether the delivery may proceed*, use HarnessX.
