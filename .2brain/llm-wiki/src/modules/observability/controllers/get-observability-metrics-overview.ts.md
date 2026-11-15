---
source: src/modules/observability/controllers/get-observability-metrics-overview.ts
sha256: 621450721e41903dbd183cfb02a6bf4c1a951e655b5f0361ba7efd4372903736
generated_at: 2026-11-14T20:28:50.192907+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-metrics-overview.ts

## Purpose

Controller handler for `GET /observability/metrics/overview`. It aggregates HTTP, auth, business, database, and process metrics into a single JSON summary. Domain counters are resolved **by metric name** off the shared prom-client registry rather than by importing the counter objects, so this module stays decoupled from the domain modules it reports on.

## Key elements

- **`MetricSample`** – local interface for one prom-client counter/gauge sample (`value`, `labels`).
- **`readCounter(name)`** – looks up a metric by name in `metricsRegistry`, calls `.get()`, and returns its `values` array. Returns `[]` when the metric is not registered (module not in this build).
- **`SHOP_METRIC_NAMES`** – readonly tuple of the four shop-domain metric names that back the `business` block.
- **`hasShopMetrics()`** – returns a boolean: whether at least one of `SHOP_METRIC_NAMES` is registered; gates the optional `business` block in the response.
- **`histogramCounts(values)`** – filters a histogram's samples to only the `_count` series (one per label combo), excluding bucket / `_sum` / `+Inf` rows.
- **`sumByLabels(values, filter)`** – sums `value` across samples whose `labels` match every key/value in `filter`.
- **`getObservabilityMetricsOverview`** *(exported)* – the Express handler. `Promise.all`s all metric reads, assembles an `ObservabilityMetricsSummary`, and sends it via `successResponse`. Errors are routed to `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – imports `catchAs` for the error-catch branch.
- **`src/infrastructure/http/response.ts`** – imports `successResponse` to send the JSON payload.
- **`src/infrastructure/observability/metrics-registry.ts`** – imports the shared `metricsRegistry` (prom-client `Registry` instance) used by `readCounter` and `hasShopMetrics`.
- **`src/infrastructure/observability/metrics-http.ts`** – imports the `httpInflightRequests` gauge (read inline, not via `readCounter`).
- **`src/modules/observability/http-readback.ts`** – imports `getHttpRequestCounters`, `getLatencyPercentiles`, and `sumMetricValues` helpers.
- **`src/modules/observability/services/index.ts`** – imports `observabilityService` to pull the process snapshot (uptime, memory).
- **`src/types/index.ts`** – imports the `ObservabilityMetricsSummary` type that shapes the response.
- **`src/modules/observability/routes.ts`** – upstream consumer that mounts `getObservabilityMetricsOverview` on the `/observability/metrics/overview` route.
- **`src/modules/observability/tests/unit/metrics-overview.support.ts`** – unit-test support that exercises this controller in isolation.

## Notes

- **Name-based lookup is intentional.** The dependency-cruiser rule `module-coupling-observability` forbids this module from importing any domain beyond `audit-logs`. Reading by name keeps deleting a domain module from breaking this file.
- **Absent metric ≠ error.** `readCounter` resolves `[]` for unregistered metrics; the response row simply shows zero.
- **`business` block is conditional.** `openapi.yaml` marks it optional; it is omitted entirely (not zeroed) when no shop metric is registered.
- **Histograms require `_count` filtering.** `histogramCounts` strips bucket/sum/+Inf rows so `sumMetricValues` does not double-count.
- **Gauges are read the same way as counters.** prom-client's `.get()` triggers `collect()`, so gauge values are always current at read time.
