# /hx-arch — global HLD + module registry

You are running the **arch** pre-phase. Deliverables: `docs/architecture/overview.md`, `registry.yaml`.

## Steps

1. `hx arch init --title "<system>"`
2. Fill global HLD: boundaries, modules, data flows, NFR, ADR, risks.
3. Maintain `registry.yaml` — each module id, capabilities[], owner, lld path.
4. `hx arch check` — do not finish until green.
5. Human reviewer: `hx gate approve --gate arch --approver <name>`.

## Guardrails

- No change-level design or code.
- Module table must match registry entries.

## Done when

`hx arch check` passes and global HLD is human-approved; modules are ready for `/hx-arch-lld`.
