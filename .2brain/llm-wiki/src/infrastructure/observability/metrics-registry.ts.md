---
source: src/infrastructure/observability/metrics-registry.ts
sha256: 93d0d1afc1eb896e7f3d7c647fffda780ee45304ff386e9b736ddda3eeeeabb1
generated_at: 2026-11-08T03:41:05.668514+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-registry.ts

## Purpose

The single shared `prom-client` registry for the entire application. It owns the process-level gauges (uptime, heap ceiling, crontab job timestamps) that no domain module should register itself, and re-exports the global `register` instance so every module's `metrics.ts` and the `/metrics` HTTP endpoint all serialize from the same collection. It was split out of `metrics-http.ts` so HTTP concerns don't live in the file every other module imports for the registry.

## Key elements

- **`metricsRegistry`** (export) — Re-export of `prom-client`'s global `register`. The one instance every gauge, counter, and histogram in the codebase attaches to.
- **`getPrometheusMetrics()`** (export) — Calls `registry.metrics()`, which runs every registered `collect()` hook and returns the full Prometheus text exposition. This is the response body of the `/metrics` scrape endpoint.
- **`collectDefaultMetrics()`** — One-time call at module load; installs the standard Node.js collectors (CPU, GC, event-loop lag, memory, etc.) onto `metricsRegistry`.
- **`_processUptimeGauge`** — Fills `process_uptime_seconds` (absent from prom-client defaults) via `process.uptime()` at scrape time.
- **`_heapSizeLimitGauge`** — Exposes V8's hard heap ceiling (`heap_size_limit`) so dashboards can alert on `used / limit` rather than the misleading `used / total` ratio.
- **`collectJobGauge`** (internal helper) — At scrape time, queries `listLeaseSummaries()` for crontab job rows and sets a per-`task`-label gauge. Resets first, skips the query entirely if Mongoose is disconnected, and leaves a label unset (not zero) when no summary exists.
- **`_jobLastSuccessGauge`** / **`_jobLastRunGauge`** — Two gauges fed by `collectJobGauge`: the last successful run and the last run of each scheduled job. The pair distinguishes "never succeeded" from "never ran" for alerting.

## Relationships

- **`metric-config.ts`** — Provides `gaugeConfig()`, which builds the `{ name, help, labelNames, ... }` object from the generated metric metadata. Every gauge in this file spreads it into the `Gauge` constructor.
- **`lease.ts`** — Provides `listLeaseSummaries()` (the data source for the two job gauges) and the `LeaseSummary` type. The gauges do I/O against this at scrape time, not at registration time.
- **`metrics-http.ts`** — The original home of this code; the `/metrics` HTTP route calls `getPrometheusMetrics()` from here to produce its response body.
- **Module `metrics.ts` files** (account, audit-logs, cart, example) — Import `metricsRegistry` from this file as the `registers` target for their own gauges/counters, ensuring all domain metrics land in the same exposition output.

## Notes

- The underscore-prefixed gauge variables (`_processUptimeGauge`, etc.) exist solely to silence unused-variable lint; the constructor's side effect (self-registration) is the entire purpose.
- `collect()` methods are plain methods (not arrows) so `this` refers to the gauge instance — required for `this.set(...)` and `this.reset()`.
- The job gauges perform a Mongoose query **at scrape time**. The readiness check (`mongoose.connection.readyState`) short-circuits to avoid the driver's buffering timeout, which would stall the scrape.
- Job gauge labels use `task`, not `job`, because the Prometheus scrape target already injects a `job="api"` label; a collision would be silently renamed to `exported_job` and break alert rules.
- A job with no lease summary is left **unset**, not set to `0` (Unix epoch), to avoid a false staleness alert on first scrape after deployment.
