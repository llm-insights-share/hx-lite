# Change planning

Produce dual-track `tasks.md` with design handoff metadata.

## When to use
- Task `dev.plan`

## Cover
- `[test]` / `[impl]` pairs covering delta Scenarios
- `@design=` pointing at LLD files; `@files=` real paths
- Optional `@group=` for parallel work; use `rollback-template` when rollback steps are material

## Rules
- Do not drop `[test]` tasks
- Scenario names must match delta specs verbatim
- Gate: `hx gate check <change> --stage dev --task plan`

## Done when
Plan suite is green
