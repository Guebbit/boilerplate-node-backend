---
source: src/infrastructure/observability/metrics-registry.ts
sha256: 28a17f7b477f334d6232a952d801e44fbfc9df004caf6af8d061ec28a286c78d
generated_at: 2026-09-27T14:13:16.740682+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-registry.ts

## Purpose

Holds the single shared prom-client registry instance and the process-wide metrics that describe the runtime itself (default Node.js collectors, uptime, heap ceiling, crontab job outcomes). It exists so that every domain module's `metrics.ts` registers against one known instance, and so the `/metrics` scrape endpoint and the observability overview controller can reach all domain counters through a single, name-addressable registry rather than importing each module individually.

## Key elements

- **`metricsRegistry`** — Re-export of prom-client's default global `register`. The canonical instance every module's `metrics.ts` registers onto; also what `GET /observability/metrics/overview` queries by metric name.
- **`collectDefaultMetrics({ register })`** — One-time call (module scope) that installs prom-client's built-in Node.js collectors (CPU, memory, event-loop lag, GC, etc.).
- **`process_uptime_seconds` (Gauge)** — Fills a gap prom-client does not ship; `collect()` returns `process.uptime()` at scrape time.
- **`nodejs_heap_size_limit_bytes` (Gauge)** — Exposes `getHeapStatistics().heap_size_limit`, the fixed V8 ceiling. Intended for the `used / limit` OOM alert ratio (as opposed to `used / total`, which is near 1 on a healthy process).
- **`job_last_success_timestamp_seconds` (Gauge, labeled `job`)** — Reads `listLeaseSummaries()` at scrape time to report each crontab job's last success epoch. Skips the query when Mongo is disconnected. Jobs with no recorded success are left unset (not zero) to avoid false staleness alerts on fresh deploys.
- **`getPrometheusMetrics()`** — Returns `registry.metrics()`, the Promise<string> body served by the `/metrics` scrape endpoint. Runs every registered `collect()` hook and renders the full registry in Prometheus text format.

## Relationships

- **`src/infrastructure/persistence/lease.ts`** — Imports `listLeaseSummaries` for the `job_last_success_timestamp_seconds` gauge's `collect()` hook.
- **`src/infrastructure/runtime/database.ts`** — Imports `connection` to gate the lease query on Mongo readiness before a scrape.
- **`src/infrastructure/observability/metrics-http.ts`** — This file was extracted from `metrics-http.ts`; the HTTP endpoint now calls `getPrometheusMetrics()` here rather than holding the registry itself.
- **Domain `metrics.ts` files** (`account`, `audit-logs`, `cart`, `inventory`, `orders`, `persistence`) — Each imports `metricsRegistry` and registers its own counters/gauges/histograms onto it.
- **`src/modules/observability/controllers/get-observability-metrics-overview.ts`** — Queries domain counters by metric name off `metricsRegistry` rather than importing the owning module.
- **`src/modules/observability/controllers/get-observability-metrics.ts`** — Serves the `/metrics` endpoint using `getPrometheusMetrics()`.
- **`src/modules/observability/tests/unit/get-observability-metrics.test.ts`** and **`metrics-overview.test.ts`** — Unit-test the serialization and overview endpoints backed by this registry.

## Notes

- The three underscore-prefixed gauge variables (`_processUptimeGauge`, `_heapSizeLimitGauge`, `_jobLastSuccessGauge`) are assigned to satisfy lint no-unused-vars; the constructor side-effect (self-registration) is the actual purpose.
- `job_last_success_timestamp_seconds` is the only gauge whose `collect()` performs I/O. It intentionally swallows errors (`.catch(() => undefined)`) so a lease-collection failure never delays or fails a scrape.
- `collect()` methods are non-arrow functions so that `this` refers to the gauge instance (required by prom-client's `Gauge` API).
- The module doc points to `docs/tools/opentelemetry.md` for broader context on how this registry fits into the project's observability stack.
