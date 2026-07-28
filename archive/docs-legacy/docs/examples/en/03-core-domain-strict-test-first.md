# Scenario 03: Payment Core-Domain Change — Strict Profile and Test-First
| | |
| --- | --- |
| **Journey** | Daily delivery |
| **Roles** | Core-domain dev |
| **Prerequisites** | Scenario(s) 01 |
| **Related** | [Scenario picker](00-scenario-picker.md) |

## Background

Payment gateway (payment-gateway) `constitution.md` declares core domains:

```markdown
core-domains: [payment-charging, payment-settlement]
```

This requirement: **pre-authorization (freeze then charge)**, touching `payment-charging` directly. Team rule: core-domain changes must use strict profile — extra explore phase, verification-strict suite, and **test-first** (human approves test assertions before agent writes implementation).

Roles: **Zhou** (payment dev), **Chen** (QA, approves test assertions), **Zhang** (architect, design-to-plan approver).

## Steps

### 1. Create change; profile recommendation auto-intervenes

```console
$ hx change create pre-auth --domains payment-charging
Created change "pre-auth" (profile: standard, domains: payment-charging)

$ hx profile recommend pre-auth --diff-lines 600
recommended: strict (score 4)
  - estimated diff 600 lines (+1)
  - touches core domain(s) payment-charging (+3)

$ hx profile recommend pre-auth --choose strict
recommended: strict (score 3)
  - touches core domain(s) payment-charging (+3)
profile set to strict
```

If Zhou tries to pick standard, the system requires a written reason on record:

```console
$ hx profile recommend pre-auth --choose standard
hx: profile "standard" is below the recommended "strict" — provide --override-reason (recorded in meta.yaml, FR-013)
```

(downgrade reason goes to `meta.yaml` `profileRecommendation.overrideReason` — auditable who skipped strict on core domain and why.)

### 2. req:requirements-research — read-only investigation

strict profile may complete the **requirements-research** task in the `req` stage before dev:propose. Zhou drives in Cursor:

```text
Cursor ▸ Read-only investigate change pre-auth and record constraints in explore.md
         Topic: existing charge state machine and idempotency key design
```

The current four-stage task catalog has no change-level `explore` slash command. Give the agent an explicit read-only instruction, then run `hx explore pre-auth --topic "existing charge state machine and idempotency key design"` to scaffold notes. Read relevant main specs first, then modules/tests, then historical changes. Record Questions / Findings / Recommendation in explore.md; **every conclusion must cite file paths**, with no code or spec edits.

Double lock: `hx guide pack pre-auth --stage req --task requirements-research` Context Pack declares **READ-ONLY** permissions; gate check flags staged code edits — discipline violations caught even if agent forgets. Exploration conclusions ("state machine is CREATED→CHARGED two states, need FROZEN; idempotency key reusable") feed dev:design.

### 3. dev:propose / dev:design / design-to-plan approval (same as scenario 02, abbreviated)

Zhou runs `/hx-dev-propose pre-auth`, then `/hx-dev-design pre-auth` in Cursor (the design task also finalizes delta specs). Terminal `hx gate advance` advances each task. `/hx-dev-design` explicitly prohibits self-approval; Zhang reviews and runs `hx gate approve pre-auth --gate design-to-plan --approver zhang.arch`.

### 4. Test-first: generate → human review → approve lock

```console
$ hx testfirst generate pre-auth
wrote tests/generated/pre-auth-payment-charging.test.ts
Review the stubs, write assertions, then: hx testfirst approve <change> --files <f1,f2> --by <name>
```

Generated stubs map one-to-one to Scenarios, initially all throw (guarantee "must be red before implementation"):

```typescript
it("Scenario: freeze succeeds within limit", () => {
  // Requirement: Pre-auth freeze
  throw new Error("not implemented — write assertions before implementation (FR-026)");
});
```

**Chen (QA) completes assertions** — amount boundaries, idempotent replay, timeout unfreeze — then approves lock:

```console
$ hx testfirst approve pre-auth --files tests/generated/pre-auth-payment-charging.test.ts --by chen.qa
approved test files recorded in meta.yaml (hash-locked)
```

### 5. Separate session implementation: agent cannot change approved assertions

After `hx plan`, Zhou opens a **new Agent session** in Cursor (not continuing the test-stub session), runs `/hx-dev-apply pre-auth` — test-first core: test-writing and implementation sessions isolated, preventing agent from "conveniently" weakening tests. New session has no prior context; all knowledge of tests comes from hash-locked test files.

In one iteration agent finds an assertion "too strict" and changes expected value. First line of defense: `.cursor/rules/harnessx.mdc` and `/hx-dev-apply` prompt say "never weaken tests to pass"; L1 relies on discipline. Real backstop is verification-strict suite `approved-tests` sensor:

```console
$ hx verify pre-auth
BLOCKER  approved-tests: 1 approved test file(s) modified
  - approved test modified: tests/generated/pre-auth-payment-charging.test.ts — assertions were approved by a human (FR-026)
NOT VERIFIED
```

Two paths, both human:

- **Assertion should change** (spec misunderstanding): Chen re-reviews and `hx testfirst approve ... --by chen.qa` again (updates hash);
- **Temporary waiver** (e.g. bank sandbox unavailable this week):

```console
$ hx waiver add pre-auth \
    --target "tests:tests/generated/pre-auth-payment-charging.test.ts" \
    --reason "Bank sandbox unavailable until 7/10, timeout assertion temporarily relaxed" \
    --requested-by zhou.dev --approved-by chen.qa \
    --expires 2026-07-11T00:00:00Z
waiver 3fa1b2c8 added for tests:tests/generated/pre-auth-payment-charging.test.ts, expires 2026-07-11T00:00:00.000Z
```

waiver requires **requester, approver, reason, expiry**; auto-expires; janitor nags (scenario 07).

### 6. verify (strict suite) → archive

verification-strict adds checks like `ai-spec-review` (rubric sensor, spec/implementation consistency). Green → archive as usual.

## Key mechanisms

- **Profile recommendation prevents forgetting, not malice**: real enforcement is downgrade must leave audit trail. Monthly audit: changes with non-empty `profileRecommendation.overrideReason`.
- **Test-first three locks**: ① generated stubs must be red; ② human approval hash-locks; ③ edits blocked by `approved-tests`, waiver required for exceptions. Makes "tests as executable behavior spec" a hard constraint.
- **Session isolation**: test writing vs implementation in separate agent sessions — equivalent to human "test review vs implementation review separation" — most effective structural defense against reward hacking (weakening tests to go green).
