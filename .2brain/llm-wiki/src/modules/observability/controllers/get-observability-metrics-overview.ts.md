---
source: src/modules/observability/controllers/get-observability-metrics-overview.ts
sha256: 7807c367681bd9599081693e9d19e5cd7f35f6c379cab7dbe21e624efc44a0a4
generated_at: 2026-11-08T06:38:54.086202+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-metrics-overview.ts

## Purpose

Controller handler for `GET /observability/metrics/overview`. Assembles a structured JSON snapshot of HTTP, auth, business, database, and process metrics. Its defining design choice is that all domain counters are resolved by **metric name** against the shared prom-client registry (`readCounter`) rather than by direct import, so the dashboard survives deletion of any domain module it reports on.

## Key elements

- **`getObservabilityMetricsOverview`** (exported) — Express handler. Fires all metric reads in parallel via `Promise.all`, shapes the result into an `ObservabilityMetricsSummary`, and sends it via `successResponse`. Catches errors with `catchAs`.
- **`readCounter(name)`** — Looks up a metric by name on `metricsRegistry`. Returns `[]` if absent (normal when the owning module is not in the build). Otherwise returns the metric's samples.
- **`SHOP_METRIC_NAMES`** — Readonly tuple of the four metric names behind the `business` block. Used by `hasShopMetrics` to decide whether to emit that block at all.
- **`hasShopMetrics()`** — Returns `true` if any name in `SHOP_METRIC_NAMES` is registered. When `false`, the `business` key is omitted from the response entirely (per `openapi.yaml` optionality).
- **`histogramCounts(values)`** — Filters a histogram's sample array down to `_count` rows only, excluding bucket, `_sum`, and `+Inf` rows that would inflate totals.
- **`sumByLabels(values, filter)`** — Sums `value` across samples whose labels match every key/value pair in `filter` (e.g. `{ status: 'success' }`).
- **`MetricSample`** (local interface) — `{ value: number; labels: Record<string, string | number | undefined> }`, one row of a prom-client metric result.

## Relationships

- **`src/infrastructure/http/response.ts`** — `successResponse` wraps the JSON payload and sets the status code.
- **`src/infrastructure/http/controller.ts`** — `catchAs` handles the `.catch` branch, serializing errors into a consistent HTTP error shape.
- **`src/infrastructure/observability/metrics-registry.ts`** — `metricsRegistry` is the single prom-client registry that `readCounter` and `hasShopMetrics` query by name.
- **`src/infrastructure/observability/metrics-http.ts`** — `httpInflightRequests` gauge; its `.get()` result is summed via `sumMetricValues` for the `http.inFlight` field.
- **`src/modules/observability/http-readback.ts`** — `getHttpRequestCounters` (total requests/errors), `getLatencyPercentiles` (p50/p95), and `sumMetricValues` (generic sample summation) are all consumed here.
- **`src/modules/observability/services/index.ts`** — `observabilityService.processSnapshot()` supplies `uptimeSeconds` and `memory` for the `process` block.
- **`src/types/index.ts`** — `ObservabilityMetricsSummary` is the response shape that constrains the object literal in the handler.
- **`src/modules/observability/routes.ts`** — Registers this handler on the `GET /observability/metrics/overview` route.
- **`src/modules/observability/tests/unit/metrics-overview.support.ts`** — Unit-test fixture/support for this controller.

## Notes

- **Name-based lookup is deliberate, not incidental.** The `module-coupling-observability` rule in `.dependency-cruiser.cjs` forbids this file from importing anything beyond `audit-logs`. Importing a domain counter directly would make deletion of that domain a compile error in this file.
- **Absent metric ≠ error.** `readCounter` returns `[]` when the metric is unregistered; downstream sums over an empty array naturally yield `0`. This is the expected state when a module is excluded from the build.
- **`business` block is all-or-nothing.** If *none* of the four `SHOP_METRIC_NAMES` are registered the block is omitted from the JSON (spread guard). If even one exists, the full block is emitted with zeros for the missing ones.
- **Gauges are read through `readCounter` too.** `products_low_stock_total` and `inventory_reserved_units_total` are gauges, but the read path is identical—`get()` at scrape time and an absent metric still reads as zero.
- **Histogram totals use only `_count` rows.** `histogramCounts` strips bucket/`_sum`/`+Inf` samples before summing, preventing inflated `queriesTotal` and `errorsTotal` figures.
