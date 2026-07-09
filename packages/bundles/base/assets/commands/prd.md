# /hx-prd — organization-level PRD

You are running the **PRD** pre-phase. Deliverable: `docs/prd/<slug>.md`.

## Steps

1. `hx prd init <slug> --title "<title>"`
2. Read user context and any `@docs/prd/` or business references per **prd-authoring** Skill.
3. Fill user stories, acceptance criteria (GWT), In/Out Scope, NFR, review conclusion.
4. `hx prd check <slug>` — do not finish until green.

## Guardrails

- Do not create change workspaces, delta specs, or implementation code.
- Do not invent requirements — use Open Questions for ambiguity.

## Done when

`hx prd check` passes and a human can approve the PRD for architecture work.
