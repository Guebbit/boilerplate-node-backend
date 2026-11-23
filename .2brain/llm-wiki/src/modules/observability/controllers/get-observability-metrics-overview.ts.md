---
source: src/modules/observability/controllers/get-observability-metrics-overview.ts
source_sha256: a55bc02910eefbc72fba4f5bb74263df332fec862f930bbcd82fb7da7c6fd824
context_sha256: 3588e6cfa4171426c6fa5722882fc841d8aa5aedd23009b7259435a7c6f30fcd
generated_at: 2026-11-22T06:01:07.249927+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/controllers/get-observability-metrics-overview.ts

## Purpose
Express controller for `GET /observability/metrics/overview`. It assembles a single `ObservabilityMetricsSummary` (HTTP, auth, optional business, database and process sections) from the shared prom-client registry. Domain counters are looked up by metric name rather than imported, so the observability module does not depend on the domains it reports on.

## Key elements
- `getObservabilityMetricsOverview(_request, response)`: the exported handler. It reads all metrics in parallel with `Promise.all`, builds the summary, sends it with `successResponse`, and routes errors through `catchAs(response, 'getObservabilityMetricsOverview')`.
- `readCounter(name)`: looks up a metric with `metricsRegistry.getSingleMetric(name)` and returns its `values`. A missing metric returns `[]`, so its row reads as zero.
- `SHOP_METRIC_NAMES` / `hasShopMetrics()`: the four shop metrics (`cart_checkout_total`, `order_created_total`, `products_low_stock_total`, `inventory_reserved_units_total`). The `business` block is included only if at least one of them is registered.
- `histogramCounts(values)`: keeps only the `_count` samples of a histogram. Bucket, `_sum` and `+Inf` rows would inflate totals.
- `sumByLabels(values, filter)`: sums sample values whose labels all match `filter`.
- `MetricSample`: local interface for a prom-client sample (`value`, `labels`).

Summary sections and their sources:
- `http`: `totalRequests` and `totalErrors` from `getHttpRequestCounters()`, `errorRate` (0 when there are no requests), `inFlight` from `httpInflightRequests`, and `latencyMs` p50/p95 from `getLatencyPercentiles()`.
- `auth`: `loginSuccess` and `loginFailure` from `auth_login_total` by `status`, and `signupSuccess` from `auth_signup_total`.
- `business` (optional): `checkoutSuccess`, `ordersCreated`, `lowStockProducts` and `reservedUnits`.
- `database`: `queriesTotal` and `errorsTotal` from the `_count` rows of `db_client_operation_duration_seconds`. Errors are rows with `outcome === 'error'`.
- `process`: `uptimeSeconds` and `memory`, taken from a snapshot obtained from the observability service.
- `timestamp`: ISO time of the response.

## Relationships
- `src/infrastructure/http/response.ts` (`successResponse`) and `src/infrastructure/http/controller.ts` (`catchAs`) handle the response and error wrapping.
- `src/infrastructure/observability/metrics-registry.ts` (`metricsRegistry`) is the registry queried by name.
- `src/infrastructure/observability/metrics-http.ts` supplies `httpInflightRequests`, which is imported directly.
- `src/modules/observability/http-readback.ts` supplies `getHttpRequestCounters`, `getLatencyPercentiles` and `sumMetricValues`.
- `src/modules/observability/services/index.ts` exports `observabilityService`, which provides the process snapshot (uptime and memory).
- `src/types/index.ts` supplies the `ObservabilityMetricsSummary` type.
- `src/modules/observability/routes.ts` and `src/modules/observability/tests/unit/metrics-overview.support.ts` are graph neighbors, but this file does not import them.

## Notes
- A missing metric is normal and reports zero, since its owning module may not be in the build. The one exception is the `business` block, which is omitted entirely (the module's docs reference `openapi.yaml`, which makes it optional) when no shop metric exists.
- `products_low_stock_total` and `inventory_reserved_units_total` are gauges but are read the same way as counters.
- The HTTP counters, in-flight gauge and latency percentiles are the only metrics tied to infrastructure or module code. Everything else is resolved by name.
