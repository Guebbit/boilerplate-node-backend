---
source: src/modules/observability/controllers/get-observability-metrics-overview.ts
sha256: 7807c367681bd9599081693e9d19e5cd7f35f6c379cab7dbe21e624efc44a0a4
generated_at: 2026-10-29T04:35:21.280929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-metrics-overview.ts

## Purpose

HTTP handler for `GET /observability/metrics/overview`. Aggregates counters, gauges, and histogram samples from the shared prom-client registry into a single `ObservabilityMetricsSummary` JSON response covering HTTP traffic, auth, shop/business, database, and process metrics. The critical design constraint is that it resolves every domain metric **by name** from the registry rather than importing the counter objects, so the observability module never has a compile-time dependency on the domains it reports on.

## Key elements

- **`getObservabilityMetricsOverview`** (exported) – Express handler. Fires all metric reads in parallel via `Promise.all`, assembles the summary object, and sends it with `successResponse`. Errors are delegated to `catchAs`.
- **`readCounter(name)`** – Looks up a metric by string name on `metricsRegistry.getSingleMetric`. Returns `[]` when the metric is absent (module not in this build) rather than throwing.
- **`SHOP_METRIC_NAMES`** – Tuple of the four shop-domain counter/gauge names. Used by `hasShopMetrics` to decide whether to include the `business` block at all.
- **`hasShopMetrics()`** – Returns `true` if any name in `SHOP_METRIC_NAMES` is registered. The `business` block is spread into the response only when this is true, so a build without shop modules omits it entirely (matching the optional schema in `openapi.yaml`).
- **`histogramCounts(values)`** – Filters a histogram's sample list down to `_count` rows, avoiding inflation from bucket, `_sum`, and `+Inf` rows.
- **`sumByLabels(values, filter)`** – Sums sample values whose labels match every key/value pair in `filter` (e.g. `{ status: 'success' }`).
- **`MetricSample`** – Local interface describing one prom-client sample (`value` + `labels`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/http/response.ts` | Imports `successResponse` to send the final JSON. |
| `infrastructure/http/controller.ts` | Imports `catchAs` to handle errors in the promise chain. |
| `infrastructure/observability/metrics-http.ts` | Imports the `httpInflightRequests` gauge for the `http.inFlight` field. |
| `infrastructure/observability/metrics-registry.ts` | Imports `metricsRegistry`; every `readCounter` call and `hasShopMetrics` lookup goes through it. |
| `modules/observability/http-readback.ts` | Imports `getHttpRequestCounters`, `getLatencyPercentiles`, and `sumMetricValues` helpers. |
| `modules/observability/routes.ts` | Registers this handler on the `/observability/metrics/overview` route. |
| `modules/observability/services/index.ts` | Imports `observabilityService` to obtain the process snapshot (uptime, memory). |
| `types/index.ts` | Imports the `ObservabilityMetricsSummary` type that shapes the response body. |
| `modules/observability/tests/unit/metrics-overview.support.ts` | Unit-test support that exercises this controller's output. |

## Notes

- **Name-based lookup is deliberate, not an accident.** The module doc comment and `.dependency-cruiser.cjs` (`module-coupling-observability`) enforce that this file may import from `audit-logs` only and never from `account`, `cart`, `inventory`, or `orders`. Importing a domain counter would make deleting that domain a compile error in this file.
- **Absent metric ≠ error.** If a domain module isn't in the current build, `readCounter` resolves to `[]` and the corresponding fields read as zero. The only exception is the entire `business` block, which is omitted (not zeroed) when no shop metric is registered.
- **Gauges are read identically to counters.** `products_low_stock_total` and `inventory_reserved_units_total` are gauges; `collect` recounts at scrape time, so they pass through the same `readCounter` path.
- **Histograms must be filtered to `_count` rows** before summing, or bucket boundaries and `_sum` will inflate totals. `histogramCounts` handles this for the database block.
