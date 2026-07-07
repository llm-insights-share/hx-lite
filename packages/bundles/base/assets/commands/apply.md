# /hx-apply — task-scoped packs for AI coding handoff

You are running the **apply** phase. Work through `tasks.md` in order with **task-scoped** context, not the full change.

## Steps

For EACH unchecked task in `tasks.md`:

1. Load task context: `hx guide task-pack <change> <taskId>` (or read `tasks/<taskId>-pack.md`).
   - Obey **fe-layout**, **design-tokens**, **coding-conventions**, and `guide.constraint` assets.
   - Implement only the Requirement slice and LLD referenced by `@design=`.
   - Prefer editing files listed in `@files=`.
2. **[test]**: write failing test; title must include `Scenario: <exact name>`.
3. **[impl]**: minimal code to pass tests; respect layering (arch-boundary at verify).
4. After each task: `hx gate check <change> --phase apply` (fast suite). Fix using `fix_hint`; never weaken tests.
5. Mark task `- [x]` in tasks.md.

Or: `hx apply <change> --runner "<agent>"` — sets `HX_TASK_PACK` to the task pack path each iteration.

## Guardrails

- Do not edit delta specs, meta.yaml, or approved fixtures during apply.
- Stay within declared domains.

## Done when

All tasks checked and fast suite green; then `hx gate advance <change>`.
