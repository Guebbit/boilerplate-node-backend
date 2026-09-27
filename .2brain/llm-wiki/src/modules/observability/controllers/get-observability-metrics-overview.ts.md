---
source: src/modules/observability/controllers/get-observability-metrics-overview.ts
sha256: e9f5d18c48fb2cf98652a8655dfd7f259a749c134efe25b2de11c416f7baedff
generated_at: 2026-09-27T15:04:09.954454+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-metrics-overview.ts

## Purpose

Controller for `GET /observability/metrics/overview`. Aggregates a fixed set of operational counters, gauges, and process stats into a single JSON summary. It resolves every domain metric by **name** off the shared prom-client registry instead of importing the domain counters directly, so this module survives the deletion of any business domain it reports on.

## Key elements

- **`MetricSample`** (interface) — shape of one prom-client counter sample: `{ value, labels }`.
- **`readCounter(name: string): Promise<MetricSample[]>`** — looks up a metric by name on `metricsRegistry`; returns `[]` when the metric is absent (i.e. the owning module isn't in this build). No domain import required.
- **`sumByLabels(values, filter)`** — sums `MetricSample[]` entries whose labels match every key/value pair in `filter`. Used to split counters by `status: 'success' | 'failure'`.
- **`getObservabilityMetricsOverview`** (exported) — the Express handler. Fans out 11 reads in parallel via `Promise.all`, assembles an `ObservabilityMetricsSummary`, and sends it through `successResponse`. Errors are forwarded to `catchAs`.

## Relationships

- **`src/infrastructure/http/response.ts`** — imports `successResponse` for the 200 reply.
- **`src/infrastructure/http/controller.ts`** — imports `catchAs` for uniform error serialization.
- **`src/infrastructure/observability/metrics-http.ts`** — imports the `httpInflightRequests` gauge (read directly, not by name).
- **`src/infrastructure/observability/metrics-registry.ts`** — imports `metricsRegistry`; the single lookup point `readCounter` uses to resolve any metric by name.
- **`src/modules/observability/http-readback.ts`** — imports `getHttpRequestCounters`, `getLatencyPercentiles`, and `sumMetricValues` helpers.
- **`src/modules/observability/services/process-snapshot.ts`** — imports `processSnapshot` for uptime and memory.
- **`src/modules/observability/routes.ts`** — registers this handler on the `/observability/metrics/overview` route.
- **`src/types/index.ts`** — imports the `ObservabilityMetricsSummary` response type.
- **`src/modules/observability/tests/unit/metrics-overview.test.ts`** — unit-tests this controller.

## Notes

- **No domain imports by design.** The file must not import counters from `account`, `cart`, or `orders`. The dependency-cruiser rule `module-coupling-observability` (in `.dependency-cruiser.cjs`) enforces that this module may only reach `audit-logs` among business domains. Adding a direct counter import will break that rule.
- **Absent metric ≠ error.** If a module (e.g. inventory) is excluded from the build, its counter is simply missing from the registry and `readCounter` returns `[]`, which sums to `0`. The response shape stays constant per `openapi.yaml`, so clients never need to branch on which modules exist.
- **Gauges read the same way.** `products_low_stock_total` and `inventory_reserved_units_total` are gauges, but `readCounter` handles them identically because prom-client `get()` on a gauge also returns `{ values }`.
- **`httpInflightRequests` is the one metric read by direct import** rather than by name; it lives in the observability infrastructure layer, not a business domain, so the coupling rule does not apply.
