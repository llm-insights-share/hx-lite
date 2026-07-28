# Scenario 19: Organization PRD and global architecture (/hx-req-prd-writing, /hx-arch-subsystem-division)

| | |
| --- | --- |
| **Journey** | Enterprise · req/arch stages |
| **Roles** | Product (PM), Architect |
| **Prerequisite** | [Scenario 01](01-new-project-onboarding.md) |
| **Next** | [Scenario 15](15-enterprise-delivery-handoff.md) |

## Background

Before each **enterprise** change, **RetailCo** maintains org-level truth under the repo root:

| Layer | Path | Owner | Stage |
| --- | --- | --- | --- |
| PRD | `docs/prd/<slug>.md` | Product | `req` |
| Global HLD | `docs/architecture/overview.md` + `registry.yaml` | Architect | `arch` |
| Module LLD | `docs/architecture/modules/<module>/lld.md` | Architect | `arch` |

Per-change `requirements/` and `design/` **distill and extend** these artifacts; after verify, `hx arch promote` **writes back** to module LLD.

## 1. req stage — PRD (`/hx-req-prd-writing`)

```text
Cursor ▸ /hx-req-prd-writing
         Target slug: member-badge
```

```console
$ hx req prd init member-badge
# then author docs/prd/member-badge.md via IDE command/skill (prd-template)
Wrote docs/prd/member-badge.md

$ hx req prd check member-badge
PASS  prd-complete: PRD complete
```

Human sign-off (terminal only):

```console
$ hx approve prd member-badge --approver chen.pm
approved PRD "member-badge" by chen.pm (artifact a1b2c3d4e5f6)
```

Record stored in `docs/.stage-approvals.yaml` with content hash binding.

## 2. arch stage — global HLD (`/hx-arch-subsystem-division`)

```console
$ hx arch init
# then author overview.md via IDE command/skill
$ hx arch check
$ hx approve arch --approver lin.arch
```

## 3. arch stage — module LLD (`/hx-arch-internal-interface`)

```console
$ hx arch lld init member
# then author modules/member/lld.md via IDE command/skill
$ hx arch lld check member
```

Map `capabilities: [member]` in `registry.yaml` for `--domains member`.

## 4. Create change (hand off to scenario 15)

```console
$ hx change create member-badge \
    --domains member \
    --profile enterprise \
    --prd member-badge \
    --arch-modules member
```

`meta.yaml` records `prdRef`, `archModules`, and initial `stage: dev` / `task: propose`. Context Pack for dev:propose/design **automatically includes** org PRD and module LLD.

## 5. Handoff to change delivery

| dev/test task | Org checks | Change artifacts |
| --- | --- | --- |
| dev:propose | `prd-complete` + `prd-approved` | `requirements/`, `proposal.md`, delta spec |
| dev:design | `arch-approved` + `arch-change-align` | `design/overview.md` + LLD dirs |
| dev:verify | `arch-drift` (warn if not promoted) | tests + traceability |
| before archive | — | **`hx arch promote <change>`** (enterprise required unless waived) |

## 6. Promote before archive

```console
$ hx arch promote member-badge --by lin.arch
$ hx archive member-badge
```

Enterprise **blocks archive** until promote completes (unless waived).

## Gates (enterprise)

| stage/task | Sensors |
| --- | --- |
| dev:propose | `prd-complete`, `prd-approved`, `requirements-complete` |
| dev:design | `arch-approved`, `arch-change-align`, `design-sdlc` suite |
| dev:verify | `arch-drift` (warn if not promoted) |

## See also

- [Scenario 15 walkthrough](15-enterprise-delivery-handoff.md) · [Chinese full version](../19-组织级PRD与架构设计.md)
- [Operation guide §4.3 req/arch stages](../../operation-guide.en.md)
- [Four-stage model](../../delivery-stages.zh-CN.md)
