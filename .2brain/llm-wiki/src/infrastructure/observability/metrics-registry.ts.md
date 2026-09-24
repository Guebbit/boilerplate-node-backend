---
source: src/infrastructure/observability/metrics-registry.ts
sha256: f98068fc7c6eeb5326f9e856f3d9d136b4fee95504d73777f09435efb6f74bd8
generated_at: 2026-09-23T17:49:20.754786+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-registry.ts

## Purpose

Holds the single shared `prom-client` registry instance and the process-wide metrics that describe the runtime itself (uptime, heap ceiling, default Node.js collectors). Extracted from `metrics-http.ts` so every module's `metrics.ts` file has a clearly-named import source for the registry they register against, rather than reaching into a file named for HTTP.

## Key elements

- **`metricsRegistry`** – Re-export of prom-client's `register` (the library's default global registry). Every module in the project registers its metrics onto this same instance.
- **`collectDefaultMetrics({ register: metricsRegistry })`** – One call that installs prom-client's built-in Node.js/process collectors (CPU, memory, event-loop lag, GC, etc.).
- **`_processUptimeGauge`** – Gauge exposing `process_uptime_seconds`; prom-client does not ship this.
- **`_heapSizeLimitGauge`** – Gauge exposing `nodejs_heap_size_limit_bytes` (the fixed V8 heap ceiling). Distinct from `nodejs_heap_size_total_bytes` (committed, grows on demand), so `used / limit` is the meaningful OOM-proximity ratio for alerting.
- **`getPrometheusMetrics(): Promise<string>`** – Serializes the entire registry in Prometheus text-exposition format; this is the response body of the `/metrics` scrape endpoint.

## Relationships

- **`metrics-http.ts`** – Historical parent; this file was split out of it. HTTP-specific metrics (request count, duration, status codes) still live there but register onto `metricsRegistry` defined here.
- **`metrics-queue.ts`** – Registers queue-related metrics onto `metricsRegistry`.
- **Each `src/modules/*/metrics.ts`** (account, audit-logs, cart, inventory, orders, payments, webhooks) and **`src/infrastructure/persistence/metrics.ts`** – All import `metricsRegistry` from this file so their domain counters/gauges land in the same scrape.
- **`get-observability-metrics-overview.ts`** – Reads domain counter values _by name_ off `metricsRegistry` (rather than importing the owning module) to build the `GET /observability/metrics/overview` response.
- **`routes.ts`** (observability) – Wires `getPrometheusMetrics` to the `/metrics` endpoint and mounts the overview route.
- **`metrics-overview.test.ts` / `routes.test.ts`** – Unit-test the overview and scrape endpoints that depend on this registry.

## Notes

- The two gauge variables are intentionally underscore-prefixed (`_processUptimeGauge`, `_heapSizeLimitGauge`) solely to satisfy lint "unused variable" rules; the `new Gauge` constructor's side-effect (self-registration) is the actual purpose, not the binding.
- Both gauges use a non-arrow `collect()` method so that `this` refers to the gauge instance at scrape time.
- `metricsRegistry` _is_ prom-client's global default (`register`), not a custom instance. Any code that imports `register` directly from `prom-client` is implicitly using the same object.
- Alerting on `nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes` will fire permanently on a healthy process (ratio hovers near 1). Use the `_limit` gauge for meaningful OOM thresholds (see `HighHeapUsage` in `prometheus.alert-rules.yaml`).
