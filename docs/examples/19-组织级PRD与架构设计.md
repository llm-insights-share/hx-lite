# 场景 19：组织级 PRD 与全局架构（/hx-prd、/hx-arch）

| | |
| --- | --- |
| **旅程** | 企业交付 · Pre-phase |
| **适用角色** | 产品、架构师 |
| **前置** | 场景 01 |

## 流程概览

1. `/hx-prd` → `docs/prd/<slug>.md` → `hx prd check`
2. `/hx-arch` → `docs/architecture/overview.md` + `registry.yaml` → `hx arch check`
3. `/hx-arch-lld <module>` → `docs/architecture/modules/<module>/lld.md` → `hx arch lld check <module>`
4. `hx change create <id> --domains ... --prd <slug> --arch-modules <module>`
5. `/hx-propose` → `/hx-design`（enterprise 下 `arch-change-align` 门禁）

## 示例命令

```bash
hx prd init member-badge --title "会员徽章"
hx prd check member-badge
hx arch init --title "会员电商"
hx arch check
hx arch lld init member --title "会员模块"
hx arch lld check member
hx change create member-badge --domains member --profile enterprise --prd member-badge --arch-modules member
```

## 门禁（enterprise）

- propose：`prd-complete` + `requirements-complete`
- design：`arch-change-align` + `design-enterprise`
