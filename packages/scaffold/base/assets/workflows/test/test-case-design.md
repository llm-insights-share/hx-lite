# /hx-test-test-case-design — test case design

You are running the **test** stage task `test-case-design`.

## Input
- Change id; specs/design from Context Pack.

## Steps
1. Run `hx test-cases init <change>` if missing (dirs only), then author `test-cases/overview.md` via test-case-design command/skill.
2. `hx gate check <change> --stage test --task test-case-design`.
3. Human approve when required.

## Output
- Test-case artifacts for the change.

## Guardrails
- No production feature code in this task.

## Done when
Test-case-design gate is green (and approved when required).
