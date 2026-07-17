# Harness Hub — golden packages

Built-in example packages for `hx hub seed` / `hxhub seed`. Teams can publish this directory as an org hub repo or copy selected assets via `seed-manifest.yaml`.

## Selective seed (two dimensions)

```bash
# Governance profile + domain scenario (recommended)
hxhub seed ./harness-hub --profile standard --scenario core,api

# Preview plan only
hxhub seed ./harness-hub --profile enterprise --scenario frontend --dry-run

# Legacy: copy entire golden hub
hxhub seed ./harness-hub --full
```

### Profiles (governance / workflow)

| Profile | Purpose |
|---------|---------|
| `minimal` | Smallest viable hub (requirements + conventions + review rubric) |
| `standard` | Default team baseline + eval set |
| `strict` | Standard + stronger API compatibility rubrics |
| `enterprise` | Enterprise delivery templates + SDLC assets |

### Scenarios (domain)

| Scenario | Purpose |
|----------|---------|
| `core` | Cross-team templates, skills, rubrics |
| `api` | Backend/API assets |
| `frontend` | UI assets |
| `mobile` | Mobile-oriented subset |
| `library` | SDK/library compatibility focus |
| `data` | Migrations, transactions, cache |
| `observability` | Logging, resilience, compliance evidence |
| `async-jobs` | Queue/job/idempotency patterns |

Manifest: `seed-manifest.yaml` (profiles, scenarios, catalog).

## Packages (`packages/`)

Packages are stored by kind under `packages/<kind>/<...>/<id>/<version>/`, for example:

- `packages/guide/skill/api-conventions/1.0.0/`
- `packages/guide/template/requirements-template/1.0.0/`
- `packages/sensor/rubric/common-review-rubrics/1.0.0/`

Each `asset.yaml` declares `stage` + `task` so `hx project create --profile <p>` / `hxhub resolve --profile <p>` can install the matching set.

Includes first-batch assets such as:

| Package | Kind | Purpose |
|---------|------|---------|
| `requirements-template@1.0.0` | guide.template | Requirements scaffold |
| `coding-conventions@1.0.0` | guide.skill | Repo coding conventions |
| `common-review-rubrics@1.0.0` | sensor.rubric | Starter inferential review rules |
| `api-conventions@1.0.0` | guide.skill | REST/error-shape conventions |
| `idempotency-keys@1.0.0` | guide.skill | Idempotency guidance |
| `uat-checklist@1.0.0` | guide.template | UAT sign-off |

See `seed-manifest.yaml` for the full catalog.

Packages ship with `.review` status `approved` so they are consumable immediately after seeding.

**Maintenance guide**: [docs/hxhub-usage.zh-CN.md](../../docs/hxhub-usage.zh-CN.md)

**Note**: Bundle and Blueprint composite kinds were removed. Topology/path differences are expressed by tagging guide/sensor packages with `stage`/`task`.
