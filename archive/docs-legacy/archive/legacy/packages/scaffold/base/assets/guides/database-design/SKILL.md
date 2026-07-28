# Database design

Fill the HLD database section; use `db-migration-template` when migrations matter.

## When to use
- Task `arch.database-design`

## Cover
- Core entities and relationships
- Storage choice and tenancy/partition notes
- Indexes / consistency / migration risks

## Rules
- Org-level model; application migrations belong in change design
- Name entities consistently with the registry modules

## Done when
`hx arch check --task database-design` is green
