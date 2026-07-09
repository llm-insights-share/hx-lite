# /hx-arch — global HLD + module registry

You are running the **arch** pre-phase. Deliverables: `docs/architecture/overview.md`, `registry.yaml`.

## Steps

1. `hx arch init --title "<system>"`
2. Fill global HLD: boundaries, modules, data flows, NFR, ADR, risks.
3. Maintain `registry.yaml` — each module id, capabilities[], owner, lld path.
4. `hx arch check` — do not finish until green.
5. 人工评审：`hx gate approve --gate arch --approver <姓名>`。

## Guardrails

- No change-level design or code.
- Module table must match registry entries.

## Done when

`hx arch check` 通过且全局 HLD 已人工批准；可进入 `/hx-arch-lld`。
