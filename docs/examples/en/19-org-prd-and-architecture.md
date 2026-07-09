# Scenario 19: Organization PRD and global architecture (/hx-prd, /hx-arch)

| | |
| --- | --- |
| **Journey** | Enterprise · Pre-phase |
| **Roles** | Product, Architect |
| **Prerequisite** | Scenario 01 |

## Flow

1. `/hx-prd` → `docs/prd/<slug>.md` → `hx prd check` → `hx gate approve --gate prd --prd <slug> --approver <name>`
2. `/hx-arch` → `docs/architecture/overview.md` + `registry.yaml` → `hx arch check` → `hx gate approve --gate arch --approver <name>`
3. `/hx-arch-lld <module>` → module LLD → `hx arch lld check <module>`
4. `hx change create` with `--prd` and `--arch-modules`
5. `/hx-propose` → `/hx-design` (enterprise runs `arch-change-align`)
6. After verify: `hx arch promote <change>` to沉淀 design into module LLD

## Gates (enterprise)

- propose: `prd-complete` + `prd-approved` + `requirements-complete`
- design: `arch-change-align` + `design-enterprise`
- verify: `arch-drift` (warn if not promoted)
