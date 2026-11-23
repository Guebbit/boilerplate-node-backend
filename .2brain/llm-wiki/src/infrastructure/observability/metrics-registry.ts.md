---
source: src/infrastructure/observability/metrics-registry.ts
source_sha256: 3aeef5fd0b602f0ca00fb0a841a71d416a43101796bfd2dec0c4129031247e8a
context_sha256: 9ae90afce8028dac70740774e96f65418d77e60858a701c27f9449962f9a3e14
generated_at: 2026-11-22T03:00:24.005878+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/metrics-registry.ts

## Purpose
Defines the shared prom-client registry that every module's `metrics.ts` registers onto, and the process-wide metrics that describe the process itself rather than any one domain: default runtime collectors, uptime, V8 heap ceiling, and the last-run/last-success time of each crontab job. It was split out of `metrics-http.ts` so that HTTP-named file isn't the place every module reaches for the registry.

## Key elements
- `metricsRegistry`: alias of prom-client's default global `register`. It is the collection `/metrics` serializes, and `GET /observability/metrics/overview` reads domain counters by name off it.
- `collectDefaultMetrics({ register })`: installs prom-client's runtime collectors (CPU, memory, event loop lag, GC, etc.) at import time.
- Process uptime gauge: adds `process.uptime()` at scrape time, since prom-client doesn't ship it.
- Heap size limit gauge: reports `getHeapStatistics().heap_size_limit`, so alerts can use `used / limit` instead of the near-constant `used / total` (see `HighHeapUsage` in `prometheus.alert-rules.yaml`).
- Job last-success gauge and job last-run gauge: labelled by `task`, with values in epoch seconds taken from `leases` rows.
- `collectJobGauge(gauge, pick)`: internal helper. It resets the gauge, skips the query if Mongoose isn't connected, then calls `listLeaseSummaries()` and sets one value per job from the chosen date. Errors are swallowed.
- `getPrometheusMetrics()`: returns `metricsRegistry.metrics()`, the Prometheus text body for `/metrics`. This runs every `collect()` hook.

## Relationships
- `src/infrastructure/observability/metric-config.ts`: `gaugeConfig(...)` builds each gauge's definition.
- `src/infrastructure/persistence/lease.ts`: `listLeaseSummaries` and the `LeaseSummary` type supply the job timestamps.
- The other observability metrics files (`metrics-http.ts`, `metrics-cache.ts`, `metrics-database.ts`, `metrics-queue.ts`, `metrics-rate-limit.ts`, `metrics-outbox.ts`, `metrics-process.ts`) and the per-module metrics files (`src/modules/account/metrics.ts`, `src/modules/audit-logs/metrics.ts`, `src/modules/cart/metrics.ts`) are the intended consumers: they register onto `metricsRegistry` instead of creating their own registry. This is the file's documented role. The imports are not visible here.

## Notes
- Importing this module has side effects: it enables default collectors and registers the gauges.
- Job gauges are left unset (not `0`) when a job has no value, because an epoch-0 timestamp would trigger a staleness alert on a fresh deployment's first scrape.
- The label is `task`, not `job`, because the scrape already adds `job="api"`. A clashing label would be renamed `exported_job`, which no rule would match.
- Job gauges do I/O in `collect()` because the cron container, a different process, produced the data. The Mongo-connected check keeps a scrape from waiting on Mongoose's command buffering.
- The `_`-prefixed gauge variables exist only to satisfy lint. Registration happens in the constructor.
- `collect()` is written as a non-arrow method so `this` is the gauge.
