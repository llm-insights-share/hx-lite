# /hx-dev-apply — change:apply

You are running the **dev** stage task `apply`.

## Input
- Resolve identifiers from the slash-command argument or user message.

## Steps
1. Load the Context Pack for this stage/task.
2. Follow bound Skills / Templates.
3. Produce the deliverable for this task.

## Output
- Task deliverables as defined by bound templates.

## Guardrails
- Do not invent structure when a bound template exists.

## Done when
- Gate check for this stage/task is green.