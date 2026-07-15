# Design: bulk-issue-coupon

## Context

Bulk coupon issuance must support 100k codes per admin import while coexisting with single-issue APIs. Proposal requires p95 < 500ms for the async import job API.

## API Surface

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | /v1/coupons/bulk-jobs | Create bulk issuance job | admin JWT |
| GET | /v1/coupons/bulk-jobs/{id} | Poll job progress | admin JWT |

## Data Model

- `bulk_jobs(id, status, created_at, ...)`
- `bulk_job_items(job_id, coupon_code, ...)`

## Decisions (ADR)

### ADR-1: Async job + message queue
- Status: proposed
- Decision: Accept upload synchronously; process rows via queue workers
- Alternatives considered: synchronous loop (rejected — violates p95 under load)
- Consequences: Requires progress polling API; ops must monitor queue depth

## Architecture Constraints

- Layering: routes → services → repositories (handlers must not import repositories directly)
- perf-budget: handler modules < 350 lines; document queue lag SLO in design

## Observability

- Metrics: `coupon_bulk_jobs_total{status}`
- Log fields: `job_id`, `batch_size`, `duration_ms`
- Alerts: queue depth > 10k for 5m

## Rollback Plan

- Disable feature flag `bulk_issue_enabled`
- Drain queue; mark in-flight jobs failed with compensating admin notice
