# /hx-req-requirements-analysis — requirements analysis

You are running the **req** stage task `requirements-analysis`.

## Input
- PRD slug; research notes if available.

## Steps
1. Scaffold dirs: `hx req analysis init <slug>` if missing.
2. Author `docs/prd/<slug>/analysis.md` via req command/skill (requirements-analysis).
3. `hx req check --task requirements-analysis --prd <slug>`.

## Output
- Org-level analysis sidecar for `<slug>`.

## Guardrails
- Org-level only — no change workspace or implementation.

## Done when
`hx req check --task requirements-analysis --prd <slug>` is green.
