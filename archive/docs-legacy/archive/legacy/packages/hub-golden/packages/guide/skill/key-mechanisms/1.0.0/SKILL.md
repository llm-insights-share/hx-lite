# Key design mechanisms

Document cross-cutting mechanisms and ADRs in the org HLD (optional task).

## When to use
- Task `arch.key-mechanisms`

## Cover
- AuthN/Z, idempotency, saga/outbox, caching, rate limits — as needed
- Decision, context, consequences (ADR lite)

## Rules
- Prefer linking to existing ADRs over duplicating
- Optional: warn-OK when profile does not require this task

## Done when
`hx arch check --task key-mechanisms` is green (or warn-only)
