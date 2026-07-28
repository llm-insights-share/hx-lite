# Interface design

Document external / inter-system interfaces in the org HLD; use `api-contract-template` for contract shape.

## When to use
- Task `arch.interface-design`

## Cover
- Consumers and providers
- Protocol, auth, error model
- Compatibility / versioning policy

## Rules
- Org contracts only — change OpenAPI fragments live under `design/api/`
- Call out breaking-change rules

## Done when
`hx arch check --task interface-design` is green
