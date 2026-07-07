# /hx-design — HLD + LLD (overview + detailed design packages)

You are running the **design** phase. Precondition: proposal is complete.

## Steps

1. Scaffold: `hx design <change>` — creates `design/overview.md`, `design/ui/pages.md`, and LLD directories.
2. Fill **HLD** in `design/overview.md` (design-template): Context, API Surface, Data Model, ADR, Architecture Constraints, Observability, Rollback, UI Layout table, Design Tokens table.
3. Fill **LLD** under `design/`:
   - `design/ui/pages.md` — page inventory (route, layout shell);
   - `design/ui/components/<page-slug>.md` — per new page/component (props, states, a11y, tokens);
   - `design/api/*.yaml` — OpenAPI fragments for new endpoints;
   - `design/data/*.sql` — schema/migration notes when needed.
4. Follow **fe-layout** and **design-tokens** Skills; align API table with delta specs.
5. Update delta specs if design reveals new scenarios; run `hx gate check <change> --phase design` (enterprise: HLD/LLD/align sensors).
6. `hx gate advance <change>` when green.

## Guardrails

- No production code; pseudocode and schemas in design/ only.
- Every new REST row in API Surface must appear in delta specs before spec approval.

## Done when

HLD sections complete, LLD files exist for new UI/API surfaces, and design gates pass.
