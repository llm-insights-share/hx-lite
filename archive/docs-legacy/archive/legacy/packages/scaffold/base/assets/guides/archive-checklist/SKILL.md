# Archive checklist

Close a change: rebase, promote (if required), archive, review retro.

## When to use
- Task `dev.archive`

## Steps
1. `hx rebase check <change>` — fix delta if main specs drifted
2. Enterprise: `hx arch promote <change>` when required
3. `hx archive <change>` — merge deltas, write `retro.md`, move to archive
4. Review retro for repeated sensor failures; commit archive separately

## Rules
- Never hand-edit main specs to force a merge
- Resolve conflicts in the delta, not in main specs
- Gate: `hx gate check <change> --stage dev --task archive`

## Done when
Change is under `harnessX/archive/` and no longer active
