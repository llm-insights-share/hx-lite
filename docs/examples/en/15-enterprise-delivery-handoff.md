# Scenario 15: Enterprise requirements → HLD/LLD → AI coding handoff (enterprise profile)

## Background

A SaaS team uses the **enterprise** profile so every change has a full artifact chain:

1. **Requirements analysis**: `requirements/` (PRD distillation)
2. **HLD**: `design/overview.md`
3. **LLD**: `design/ui/`, `design/api/`, `design/data/`
4. **Behaviour specs**: delta spec + `delivery-trace.yaml`
5. **Coding handoff**: `tasks.md` with `@design=` / `@files=`, `hx guide task-pack` per task

## Quick flow

```console
$ hx change create member-badge --domains member --profile enterprise
$ hx propose member-badge --title "Member badge display"
$ hx design member-badge
$ hx gate check member-badge --phase design
$ hx gate approve member-badge --gate spec --approver pm
$ hx plan member-badge
$ hx guide task-pack member-badge 01b
$ hx apply member-badge --runner '<agent>'
$ hx verify member-badge
```

See the [Chinese walkthrough](../15-企业级需求到交付交接.md) for role split and artifact examples.

## Key mechanisms

| Capability | Where |
| --- | --- |
| PRD distillation | `requirements/*` + `requirements-complete` sensor |
| HLD / LLD split | `design/overview.md` + `design/ui|api|data/` |
| End-to-end trace | `traces/delivery-trace.yaml` |
| Task handoff | `@design=` / `@files=` in `tasks.md` |
| Scoped apply context | `hx guide task-pack <change> <taskId>` → `HX_TASK_PACK` |
