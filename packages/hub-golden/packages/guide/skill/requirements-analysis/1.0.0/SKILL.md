# Requirements analysis

Write the org-level analysis sidecar (`analysis.md`) for a PRD slug.

## When to use
- Task `req.requirements-analysis`
- After research notes exist (optional but preferred)

## Structure
1. **Problem & opportunity** — what hurts, why now
2. **Users & scenarios** — primary personas and top flows
3. **Priority (P0/P1)** — must-have vs later
4. **Solution outline** — approach without implementation detail

## Rules
- Org-level only; no change workspace or code
- Prefer evidence from research; put unknowns in open questions
- Keep each section substantive (empty headings fail the sensor)

## Done when
`hx req check --task requirements-analysis --prd <slug>` is green
