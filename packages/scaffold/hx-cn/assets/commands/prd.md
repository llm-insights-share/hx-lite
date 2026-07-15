# /hx-prd — organization-level PRD

You are running the **PRD** pre-phase. Deliverable: `docs/prd/<slug>.md`.

## Steps

1. `hx prd init <slug> --title "<title>"`
2. Read user context and any `@docs/prd/` or business references per **prd-authoring** Skill.
3. Fill user stories, acceptance criteria (GWT), In/Out Scope, NFR, review conclusion.
4. `hx prd check <slug>` — do not finish until green.
5. 人工评审：`hx gate approve --gate prd --prd <slug> --approver <姓名>`。

## Guardrails

- Do not create change workspaces, delta specs, or implementation code.
- Do not invent requirements — use Open Questions for ambiguity.

## Done when

`hx prd check` 通过且 PRD 已人工批准（`hx gate approve --gate prd`）。
