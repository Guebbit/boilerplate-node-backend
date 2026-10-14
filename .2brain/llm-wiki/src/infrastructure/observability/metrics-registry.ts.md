---
source: src/infrastructure/observability/metrics-registry.ts
sha256: 189f04149497be6f31660c341121a32719e36adba9f50d9dd595b24153954d2a
generated_at: 2026-10-14T08:07:08.184913+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-registry.ts

## Purpose

Holds the single shared `prom-client` registry instance and the process-level gauges that describe the runtime itself (uptime, heap ceiling, crontab job outcomes). Every other module's `metrics.ts` imports `metricsRegistry` from here so all metrics land on the same global registry that `GET /metrics` serializes. Split out of `metrics-http.ts` to give the registry a name that isn't misleading for non-HTTP consumers.

## Key elements

- **`metricsRegistry`** – Re-export of `prom-client`'s default `register`. The canonical registry every module registers gauges/counters onto.
- **`collectDefaultMetrics({ register })`** – One-time call (module side effect) that installs prom-client's bundled Node.js collectors (CPU, memory, event-loop lag, GC, etc.).
- **`_processUptimeGauge`** – `process_uptime_seconds`; prom-client omits this, so it is added manually via `process.uptime()`.
- **`_heapSizeLimitGauge`** – `nodejs_heap_size_limit_bytes`; reads `getHeapStatistics().heap_size_limit` at scrape time. Provides a stable denominator for OOM-style alert rules (vs. the growing `total` heap).
- **`collectJobGauge(gauge, pick)`** – Shared helper: resets the gauge, then (if Mongo is connected) queries `listLeaseSummaries()` and sets a per-`task` label with the chosen date as Unix seconds. Returns early without querying when the connection is not ready to avoid mongoose buffering delays during a scrape.
- **`_jobLastSuccessGauge`** – `job_last_success_timestamp_seconds{task}`; reports each crontab job's last success from lease rows.
- **`_jobLastRunGauge`** – `job_last_run_timestamp_seconds{task}`; reports each crontab job's last run regardless of outcome. Together with the success gauge, distinguishes "ran but never succeeded" from "never ran."
- **`getPrometheusMetrics()`** – Returns `registry.metrics()`, the full Prometheus text-format body served by the `/metrics` endpoint.

## Relationships

- **`lease.ts`** – Direct dependency: imports `listLeaseSummaries` and the `LeaseSummary` type to feed the two job gauges.
- **`metrics-http.ts`** – This file was extracted from it; `metrics-http.ts` now registers HTTP-specific metrics onto the same `metricsRegistry` rather than owning it.
- **Module `metrics.ts` files** (`account`, `audit-logs`, `cart`, `example`, `inventory`) – Each imports `metricsRegistry` and registers its domain counters/gauges onto it. They do not import each other; they all converge on this file.
- **`metrics-cache.ts`, `metrics-queue.ts`, `metrics-rate-limit.ts`, `metrics-outbox.ts`, `metrics-process.ts`, `security-events.ts`, `command-metrics.ts`** – Sibling metric definitions that register onto the same shared registry instance.
- **`two-factor.test.ts`** – Test file that (transitively) depends on the registry for metric assertions or to verify counter increments.

## Notes

- The underscore-prefixed `_` variable names on the process gauges are deliberate: the gauge's constructor side-effect (self-registration) is the point; the variable exists only to satisfy lint's "no unused expressions" rule.
- `collectJobGauge` guards on `mongoose.connection.readyState` before querying. An unconnected Mongoose model would queue the command and wait out the driver's buffering timeout, which would stall a scrape. The two gauges above it need no such guard because they read in-memory values.
- The label on job gauges is `task`, not `job`, because Prometheus adds its own `job` label at scrape time; a collision would be silently renamed to `exported_job`, breaking alert rules.
- `collect()` on the job gauges performs I/O (a Mongo query) at scrape time, unlike the uptime/heap gauges which read in-memory values. Scrape handlers must therefore tolerate a slow Mongo response without timing out the entire `/metrics` request.
- A job with no lease row is left *unset* (no series) rather than `0`, so a fresh deployment's first scrape does not fire a false staleness alert.
