---
source: src/infrastructure/observability/metrics-registry.ts
sha256: 93d0d1afc1eb896e7f3d7c647fffda780ee45304ff386e9b736ddda3eeeeabb1
generated_at: 2026-10-29T02:11:02.199558+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-registry.ts

## Purpose

Single home for the project-wide `prom-client` registry and the process-level metrics that describe the runtime itself (default Node.js collectors, uptime, heap ceiling, crontab job timestamps). Extracted from `metrics-http.ts` so that every module's `metrics.ts` file reaches for a registry in a file whose name matches its purpose, rather than an HTTP-utility file.

## Key elements

- **`metricsRegistry`** — Re-export of prom-client's `register` (the default global registry that `/metrics` serializes). All other metric modules register their collectors against this instance.
- **`collectDefaultMetrics({ register: metricsRegistry })`** — One-shot call that installs prom-client's built-in Node.js runtime collectors (CPU, memory, event-loop lag, GC, etc.).
- **`_processUptimeGauge`** — Gauge exposing `process.uptime()`; fills the gap that prom-client omits `process_uptime_seconds`.
- **`_heapSizeLimitGauge`** — Gauge exposing `getHeapStatistics().heap_size_limit`; the fixed V8 ceiling (as opposed to the growing `total`), giving a meaningful `used / limit` OOM ratio.
- **`collectJobGauge`** *(internal)* — Shared `collect()` helper that calls `listLeaseSummaries()` and stamps a per-`task` label gauge with a picked date. Resets the gauge first, skips the query if Mongo is disconnected, swallows errors.
- **`_jobLastSuccessGauge`** — Per-crontab-job "last success" timestamp, read from lease rows at scrape time.
- **`_jobLastRunGauge`** — Per-crontab-job "last run" (success or failure) timestamp; paired with the success gauge to distinguish "never ran" from "never succeeded."
- **`getPrometheusMetrics`** — `metricsRegistry.metrics()`; returns the full Prometheus text-format body for the `/metrics` scrape endpoint.

## Relationships

- **`metric-config.ts`** — Provides `gaugeConfig()` which supplies the shared `name`/`help`/`labelNames` shape for every gauge defined here.
- **`metrics.generated.ts`** — Supplies `infrastructureMetricData.*` (metric names, help strings) so the registry's gauges stay in sync with the generated catalog.
- **`lease.ts`** — `listLeaseSummaries` and the `LeaseSummary` type are the data source for the two crontab job gauges; the gauges do I/O at scrape time rather than caching in-memory.
- **`metrics-http.ts`** — This file was split out of it; the HTTP layer calls `getPrometheusMetrics` (or reads `metricsRegistry`) to build the `/metrics` response.
- **Module `metrics.ts` files** (`account`, `audit-logs`, `cart`, `command-metrics`, `metrics-cache`, `metrics-process`, `metrics-queue`, `metrics-rate-limit`, `security-events`) — Each registers its own counters/gauges on `metricsRegistry` so they appear in the same `/metrics` scrape.
- **`two-factor.test.ts`** — Unit tests that may assert or stub metrics registered against this registry.

## Notes

- **Label is `task`, not `job`.** Prometheus adds its own `job="api"` label at scrape time; a `job` label on the metric would be silently renamed to `exported_job`, breaking alert rules.
- **Job gauges perform I/O in `collect()`.** Unlike the uptime/heap gauges (pure in-memory reads), the job gauges hit Mongo. The `readyState` check prevents mongoose from buffering the query and stalling a scrape.
- **Underscore-prefixed variables** (`_processUptimeGauge`, `_heapSizeLimitGauge`, etc.) exist solely to satisfy lint's unused-variable rule; the side effect of the `Gauge` constructor (self-registration) is the intended value.
- **`used / total` is not a useful alert signal** on a healthy process (ratio ≈ 1). The `heap_size_limit` gauge exists specifically so `used / limit` can feed the `HighHeapUsage` alert rule.
