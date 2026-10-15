---
source: src/modules/observability/controllers/get-observability-metrics-overview.ts
sha256: 8abba446adc95b8c18424226e91550c1c2d052d596f81421816ab5b2afba1ac1
generated_at: 2026-10-15T10:54:47.886304+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-metrics-overview.ts

## Purpose

Controller for `GET /observability/metrics/overview`. It assembles a structured JSON summary of operational metrics (HTTP, auth, business, database, process) by looking up each metric **by name** on the shared prom-client registry instead of importing the counters directly. This keeps the observability module free of compile-time dependencies on any domain module (account, cart, orders), so deleting a domain never breaks this file.

## Key elements

- **`readCounter(name)`** — Looks up a single metric by name via `metricsRegistry.getSingleMetric(name)` and returns its samples. Returns an empty array (zero) if the metric is unregistered, treating absence as a normal state.
- **`SHOP_METRIC_NAMES`** — Tuple of the four shop-domain counter/gauge names that back the `business` block of the response.
- **`hasShopMetrics()`** — Returns `true` if any name in `SHOP_METRIC_NAMES` is registered; controls whether the `business` key is present in the response.
- **`histogramCounts(values)`** — Filters a histogram's sample list down to `_count` rows only, excluding bucket, `_sum`, and `+Inf` entries.
- **`sumByLabels(values, filter)`** — Sums values whose labels match every key/value pair in `filter` (used for status-labelled counters like login success/failure).
- **`getObservabilityMetricsOverview`** *(exported handler)* — The Express route handler. Fans out parallel reads (HTTP counters, inflight gauge, latency percentiles, auth/shop/db counters), assembles an `ObservabilityMetricsSummary` object, and sends it via `successResponse`. Errors are funneled through `catchAs`.
- **`MetricSample`** *(local interface)* — Shape of one prom-client sample (`value` + `labels`).

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-catch wrapper used in the `.catch` tail.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the typed 200-responder.
- **`src/infrastructure/observability/metrics-http.ts`** — Supplies the `httpInflightRequests` gauge, read directly (not by name) because it lives in infrastructure, not a domain.
- **`src/infrastructure/observability/metrics-registry.ts`** — Supplies `metricsRegistry`, the single shared prom-client registry that `readCounter` queries.
- **`src/modules/observability/http-readback.ts`** — Supplies `getHttpRequestCounters`, `getLatencyPercentiles`, and `sumMetricValues` used to build the `http` section.
- **`src/modules/observability/services/process-snapshot.ts`** — Supplies `processSnapshot()` for the `process` section (uptime, memory).
- **`src/types/index.ts`** — Supplies the `ObservabilityMetricsSummary` response type.
- **`src/modules/observability/routes.ts`** — Registers this handler on the `/observability/metrics/overview` route.
- **`src/modules/observability/tests/unit/metrics-overview.support.ts`** — Provides test fixtures/mocks for unit-testing this controller.

## Notes

- **Name-based lookup is intentional and enforced.** A dependency-cruiser rule (`module-coupling-observability`) prevents this module from importing anything outside the observability and `audit-logs` domains. Do not replace `readCounter` with a direct import of a domain counter.
- **The `business` block is conditional.** It is omitted entirely (not zero-filled) when none of the four `SHOP_METRIC_NAMES` are registered, matching the optional `business` field in `openapi.yaml`.
- **Histograms are read as counters.** Only `_count` rows are summed; the bucket, `_sum`, and `+Inf` rows would double-count if included. The `databaseCommandValues` read for `db_client_operation_duration_seconds` relies on this filter.
- **Gauges use the same `readCounter` path.** Gauges like `products_low_stock_total` and `inventory_reserved_units_total` are re-counted at scrape time but are read identically to counters here; an absent gauge reads as zero.
