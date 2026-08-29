# src/infrastructure/observability/metrics-http.ts

## Purpose

Defines and registers all HTTP-level and process-level Prometheus metrics (via `prom-client`) for the service. It provides the shared registry, the core RED counters/histograms for request traffic, in-flight gauges, and helper functions for recording a completed request and aggregating histogram data into percentiles. It exists so that every module and the HTTP middleware write into a single, scrape-ready metric set rather than ad-hoc per-module registries.

## Key elements

- **`metricsRegistry`** – Re-export of `prom-client`'s default `register`. Every module's `metrics.ts` and the scrape endpoint reference this single instance.
- **`collectDefaultMetrics()`** – One-time call that installs prom-client's built-in Node.js collectors (CPU, memory, event-loop lag, GC, etc.) into the shared registry.
- **`_processUptimeGauge` / `_heapSizeLimitGauge`** – Two `Gauge` metrics (`process_uptime_seconds`, `nodejs_heap_size_limit_bytes`) with `collect()` callbacks that read the value at scrape time. Both are private (underscore-prefixed, unused reference) and exist only for their registration side-effect.
- **`httpRequestsTotal`** – `Counter` (labels: `method`, `route`, `status_code`). The primary request-count series.
- **`httpRequestDuration`** – `Histogram` (labels: `method`, `route`; buckets: 5–5000 ms). Deliberately omits `status_code` to control cardinality.
- **`httpRequestErrorsTotal`** – `Counter` (labels: `method`, `route`, `status_code`). Counts only 4xx/5xx for cheap alerting.
- **`httpInflightRequests`** – Unlabelled `Gauge`. Live count of requests currently being processed.
- **`UNMATCHED_ROUTE`** – String constant (`'unmatched'`) used as the single label value for requests that hit no Express route, preventing unbounded label growth.
- **`getRouteLabel(request)`** – Reads `request.route` (set by Express during routing) and returns the mounted route template as a stable string, or `UNMATCHED_ROUTE`. Normalizes trailing slashes.
- **`recordRequestMetric(input)`** – Single entry point that increments the request counter, observes the histogram, and (for ≥ 400) increments the error counter. Takes a `RequestMetricInput` object.
- **`incrementInflight()` / `decrementInflight()`** – Pair to manage the in-flight gauge; must be called in matching pairs around each request lifecycle.
- **`aggregateLatencyBuckets(values)`** – Internal: collapses a prom-client histogram `get()` result into sorted per-boundary cumulative counts plus a total. Skips `_sum`/`_count` rows.
- **`sumMetricValues(values)`** – Internal: sums all sample values in a prom-client `get()` result into one number.
- **Percentile estimation** (truncated in source) – Walks the cumulative buckets to estimate p50/p95/p99.

## Relationships

- **`src/infrastructure/http/middlewares/request-logger.ts`** – Calls `incrementInflight`, `decrementInflight`, and `recordRequestMetric` on each request's `finish` event; the primary consumer of the public recording API.
- **`src/modules/*/metrics.ts`** (account, audit-logs, cart, inventory, orders, payments) – Each imports `metricsRegistry` to register domain-specific counters against the same shared registry, making them visible to `/metrics` scrapes.
- **`src/modules/observability/controllers/get-observability-metrics-overview.ts`** – Reads metric values (via `metricsRegistry.getSingleMetric` or `getMetricsAsJson`) to build the JSON overview response; uses `aggregateLatencyBuckets` and the percentile helper for latency summaries.
- **`src/modules/observability/routes.ts`** – Wires the overview controller to `GET /observability/metrics/overview`.
- **`src/infrastructure/observability/process-snapshot.ts`** – Sibling in the same directory; likely consumes the process gauges (`process_uptime_seconds`, `nodejs_heap_size_limit_bytes`) or `collectDefaultMetrics` output for snapshot reporting.
- **`src/app/telemetry.ts`** – Application-level telemetry setup; likely the startup file that ensures `collectDefaultMetrics` and the metric definitions are loaded before the HTTP server begins serving.
- **`tests/unit/infrastructure/observability/metrics-http.test.ts`** – Unit tests for `getRouteLabel`, `recordRequestMetric`, `aggregateLatencyBuckets`, and the percentile logic.
- **`src/modules/observability/tests/unit/metrics-overview.test.ts`** – Tests the overview controller, exercising the aggregation helpers indirectly.

## Notes

- **In-flight gauge pairing is manual.** There is no try/finally wrapper here; the middleware is responsible for calling `decrementInflight` on *every* exit path (success, error, client abort). A missed call causes permanent upward drift.
- **Label cardinality discipline.** `route` is always a stable template (from `getRouteLabel`), never a raw path. `status_code` is excluded from the histogram labels on purpose. The `UNMATCHED_ROUTE` constant caps the "no match" case to one series.
- **Gauges use `collect()` callbacks, not timers.** `process_uptime_seconds` and `nodejs_heap_size_limit_bytes` compute their value at scrape time, so there is no interval bookkeeping.
- **`_processUptimeGauge` / `_heapSizeLimitGauge` are intentionally "unused" variables.** The underscore prefix and the lint suppression are deliberate; the constructor side-effect (registration) is the entire purpose.
- **Histogram buckets are the precision limit.** Percentile queries can only resolve to the listed boundaries (5, 10, 25, …, 5000 ms); there is no interpolation between them.
- **`httpRequestErrorsTotal` is redundant with `httpRequestsTotal` filtered by status ≥ 400.** It exists solely to keep alerting rules a simple `rate()` over one counter.
