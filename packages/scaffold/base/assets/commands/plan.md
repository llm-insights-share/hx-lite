# /hx-plan — dual-track tasks with design handoff

You are running the **plan** phase. Output: `tasks.md` with `@design=` and `@files=` on each task, plus synced `delivery-trace.yaml`.

## Steps

1. Run `hx plan <change>` — generates test/impl pairs with `@design=` and `@files=` hints.
2. Review and edit `tasks.md`: reorder, split large impl tasks, add `@group=` for parallel work.
3. Ensure each impl task has a meaningful `@design=` pointing to an LLD file under `design/`.
4. Refine `@files=` to real paths in your repo (replace globs where possible).
5. Run `hx gate check <change> --phase plan` (plan-coverage on enterprise profile).
6. `hx gate advance <change>`.

## Guardrails

- Do not delete `[test]` tasks.
- Tasks must reference Scenario names verbatim for traceability.

## Done when

`tasks.md` is complete with design handoff refs and plan gate passes.
