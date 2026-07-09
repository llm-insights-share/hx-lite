# /hx-arch-lld — module LLD

You are running the **arch-lld** pre-phase for one module. Deliverable: `docs/architecture/modules/<module>/lld.md`.

## Steps

1. Confirm module exists in `registry.yaml` (or register it).
2. `hx arch lld init <module> --title "<name>"`
3. Fill components, interface contracts (IF-xxx), data model, flows, errors, security.
4. `hx arch lld check <module>` — do not finish until green.

## Guardrails

- Align with global HLD in `docs/architecture/overview.md`.
- Interface IDs unique within the module.

## Done when

Module LLD passes `hx arch lld check` and capabilities map to `touchedDomains` for future changes.
