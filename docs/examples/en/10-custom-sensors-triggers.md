# Scenario 10: Security Team Integrates Custom Scanner — Shell Sensors, Event Triggers, and Fix Loop
| | |
| --- | --- |
| **Journey** | Tools |
| **Roles** | Security |
| **Prerequisites** | Scenario(s) 01 |
| **Related** | [Scenario picker](00-scenario-picker.md) |

## Background

Security group maintains internal sensitive-data scanner (Python `secscan`: hardcoded secrets, internal URLs, ID number regex, etc.). They want:

1. secscan as Sensor in each repo's verification suite, **structured report output** not log dumps;
2. **scan on save** for high-risk paths like `config/` and `*.env.example` (not wait for verify);
3. one-click fix session with context when issues found.

## Steps

### 1. Integrate scanner via `check: shell`

Shell sensors run a command from the repo root. Exit 0 = pass; optional stdout JSON line = `SensorReport`. Env includes `HX_ROOT`, `HX_CHANGE`, `HX_OUTPUT`, etc. (see [Sensor config manual](../../sensor-config-manual.zh-CN.md)).

```bash
#!/usr/bin/env bash
# harnessX/assets/sensors/secscan/check.sh
set -euo pipefail
ROOT="${HX_ROOT:-.}"
CHANGE="${HX_CHANGE:-}"
# Call your scanner; emit one JSON SensorReport line
secscan --json "$ROOT" | node -e '
  let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
    const issues=JSON.parse(d||"[]");
    console.log(JSON.stringify({
      status: issues.length?"fail":"pass",
      summary: issues.length+" secret-like finding(s)",
      findings: issues.map(i=>({
        severity:"block", file:i.path, line:i.line, rule:i.rule, message:i.message,
        fix_hint:"Remove hardcoded value; use env vars or secret manager"
      }))
    }));
    process.exit(issues.length?1:0);
  });
'
```

```yaml
sensors:
  - id: secscan
    kind: sensor.script
    execution: computational
    stage: dev
    task: verify
    check: shell
    run: "bash assets/sensors/secscan/check.sh"
    on_fail: block
    timeout_ms: 180000

suites:
  verification: [spec-validate, spec-trace, secscan]
```

**Fail-closed**: crash, timeout, invalid JSON → error, gate blocks.

### 1b. Three-kind config (inline / shell / rules)

Prefer declaring checks in `harness.yaml` + `assets/sensors/<id>/config.yaml` (full handbook: [Sensor 配置使用手册](../../sensor-config-manual.zh-CN.md)):

```yaml
# harness.yaml
sensors:
  - id: spec-validate
    kind: sensor.script
    execution: computational
    check: inline
    expr: "spec.ears_ok == true"
    source: assets/sensors/spec-validate
    on_fail: block
    config:
      ears:
        vague_words: [quickly, seamlessly]

  - id: no-todo-prd
    kind: sensor.rule
    execution: computational
    check: inline
    expr: "rules.list_ok"
    source: assets/sensors/example-rule
    on_fail: warn
```

### 2. Scan on save for high-risk paths (file-save trigger)

```yaml
  - id: secscan-hot
    kind: sensor.script
    execution: computational
    trigger: file-save
    scope: ["config/**", "**/*.env.example", "deploy/**"]
    check: shell
    run: "bash assets/sensors/secscan/check.sh"
    on_fail: block
```

```console
$ hx watch
watching for file-save triggered sensors (ctrl-c to stop)
[fail] secscan-hot ← config/redis.yaml: 1 secret-like finding(s)
```

Nightly CI can run `hx schedule run` for `trigger: schedule` sensors.

### 3. One-click fix loop: hx fix

```console
$ hx fix --change fee-recalc --sensor secscan
fix pack: harnessX/changes/fee-recalc/fix-pack.md (3 finding(s))
```

### 4. False positive governance: waiver not disable rule

```console
$ hx waiver add fee-recalc --target secscan \
    --reason "Fake ID numbers in seed-data.sql for test data, confirmed with security (SEC-1142)" \
    --requested-by li.dev --approved-by security.zhao \
    --expires 2026-10-01T00:00:00Z
```

## Key mechanisms

- **Three check kinds**: `inline` (predicates / `handler.*`), `shell` (external tools), `rules` (LLM/heuristic review).
- **Three trigger tiers**: phase (at gate), file-save (on save), schedule (nightly).
- **Structured report enables fix loop**: `findings[].file/line/fix_hint` + `fix_command`.
