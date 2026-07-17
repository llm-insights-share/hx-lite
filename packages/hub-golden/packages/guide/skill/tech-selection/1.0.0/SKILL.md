# Technology selection

Fill the HLD「技术选型」section with reasoned stack choices.

## When to use
- Task `arch.tech-selection`

## Cover
- Runtime / language / framework
- Storage, messaging, cache (as relevant)
- Trade-offs and rejected alternatives
- Constraints (compliance, team skill, ops)

## Rules
- Prefer ADR-style rationale over feature lists
- Align with subsystem boundaries already in the HLD
- Org architecture only — no change design

## Done when
`hx arch check --task tech-selection` is green
