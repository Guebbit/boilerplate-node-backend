---
source: shared/rules/metrics.yaml
generated_at: 2026-11-22T02:26:32.600466+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/metrics.yaml

## Purpose
Declarative catalogue of every infrastructure Prometheus-style metric: name, kind, help text, label names and (for histograms) buckets. Dashboards and alert rules are written against these names, so they live as data that a twin can copy. Recording, `collect()` hooks and the registry remain code, and a module's own metrics stay in its `metrics.ts`.

## Key elements
- Top-level `metrics:` map, keyed by the camelCase name of the constant the code uses. Each entry has `name`, `kind`, `help`, and optionally `labelNames` and `buckets`.
- **HTTP**: `httpRequestsTotal`, `httpRequestDuration` (histogram, ms buckets 5–5000), `httpRequestErrorsTotal`, `httpInflightRequests` (gauge).
- **Database**: `queryTimeoutsTotal` (MaxTimeMSExpired, answered 503), `databaseOperationDuration` (histogram in seconds, labelled by collection/operation/outcome).
- **Cache**: `cacheInvalidationFailuresTotal` (label `tag`), `cacheRequestsTotal` (label `result`: hit, miss, stale, refresh).
- **Outbox**: `outboxEventsPublishedTotal`, `outboxEventsRetriedTotal`, `outboxEventsDeadTotal`, `outboxPendingEvents` (gauge).
- **Auth/security**: `securityEventsTotal` (label `event`), `staleCredentialsTotal` (labels `kind`, `reason`).
- **Queues**: `queueJobsDeadLetteredTotal` (label `queue`), `queueHeldJobs` and `queueHeldJobsOldestAgeSeconds` (gauges, label `channel`).
- **Rate limits**: `rateLimitStoreFallbackTotal` (label `namespace`), `rateLimitRefusalsTotal` (label `budget`, 429s).
- **Process/runtime**: `processUnhandledRejectionsTotal`, `processUptimeSeconds`, `nodejsHeapSizeLimitBytes`.
- **Cron jobs**: `jobLastSuccessTimestampSeconds`, `jobLastRunTimestampSeconds` (gauges, label `task`).

## Relationships
- `shared/rules/outbox.yaml`: the `outbox_*` metrics here (published, retried, dead, pending) describe the outbox's dispatch lifecycle: published, rescheduled with backoff, parked as dead after exhausting attempts.
- `shared/rules/rate-limits.yaml`: `rate_limit_refusals_total` is labelled by `budget` and `rate_limit_store_fallback_total` covers operations served without the limits Redis. These correspond to the rate-limit budgets and store defined there.

## Notes
- This file is not read at boot. `npm run regenerate` writes `src/infrastructure/observability/metrics.generated.ts` from it, so edit this file and regenerate rather than editing the generated TypeScript.
- Counter names end in `_total`. Only histograms have `buckets`, in the unit the metric name states (ms vs seconds).
- Cron job metrics use the label `task` rather than `job`. The scrape adds its own `job="api"`, and a clashing label would be renamed `exported_job`, which no rule would match.
- `queueHeldJobsOldestAgeSeconds` is absent when no job is held.
- Renaming a `name:` breaks dashboards and alert rules written against it.
