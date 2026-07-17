# Test case authoring

Design change-level test cases mapped to Scenarios / AC; structure with `test-cases-template`.

## When to use
- Task `test.test-case-design`

## Cover
- Case id, preconditions, steps, expected result
- Trace to `Scenario:` names and PRD AC ids
- Happy path + material error/boundary cases

## Rules
- No feature implementation in this task
- Human approve when required after submit

## Done when
`hx gate check <change> --stage test --task test-case-design` is green
