# src/infrastructure/observability/metrics-http.ts

## Purpose

Defines and registers all HTTP-level and Node.js process-level Prometheus metrics for the service. It provides the shared prom-client registry that every module's `metrics.ts` file registers against, the RED metrics (rate, errors, duration) for every request, in-flight gauge tracking, and helper utilities for reading and summarising histogram data in the in-app overview endpoint.

## Key elements

- **`metricsRegistry`** – Re-export of prom-client's default `register`. The single shared registry all modules use so `/metrics` and the overview endpoint see one coherent set of series.
- **`collectDefaultMetrics({ register })`** – One-time call that installs Node.js runtime collectors (CPU, memory, event-loop lag, GC, etc.) onto the shared registry.
- **`_processUptimeGauge` / `_heapSizeLimitGauge`** – Two custom Gauges prom-client does not ship: `process_uptime_seconds` and `nodejs_heap_size_limit_bytes` (the fixed V8 ceiling, useful for `used/limit` OOM alerts).
- **`httpRequestsTotal`** (Counter) – Total requests by `method`, `route`, `status_code`. The canonical RED numerator.
- **`httpRequestDuration`** (Histogram) – Request duration in ms, buckets `[5…5000]`, labels `method` + `route` only (no `status_code` to limit cardinality).
- **`httpRequestErrorsTotal`** (Counter) – 4xx/5xx responses by method, route, status. Keeps alert rules simple.
- **`httpInflightRequests`** (Gauge) – Unlabelled live count of requests in flight; paired with `incrementInflight()` / `decrementInflight()`.
- **`UNMATCHED_ROUTE`** – Constant `'unmatched'` used as the `route` label for requests that hit no Express route, bounding cardinality.
- **`getRouteLabel(request)`** – Extracts the matched route template from `request.route` + `request.baseUrl`, normalises trailing slashes, and falls back to `UNMATCHED_ROUTE`.
- **`recordRequestMetric(input)`** – Records one completed request: increments the total counter, observes the duration histogram, and increments the error counter if status ≥ 400.
- **`incrementInflight()` / `decrementInflight()`** – Gauge up/down; must be called in matched pairs on every code path.
- **`aggregateLatencyBuckets(values)`** – Collapses a prom-client histogram `get()` result into a sorted array of `{ upperBound, cumulativeCount }` pairs plus a total count (skips `_sum`/`_count` rows, uses `+Inf` for total).
- **`percentileFromHistogramBuckets(buckets, total, p)`** – Walks cumulative buckets to return the first boundary whose count ≥ `total × p`. A coarse approximation (returns the bucket boundary, not an interpolated value).
- **`sumMetricValues(values)`** – Sums `.value` across all label-combination entries to get one aggregate number.

## Relationships

- **`src/infrastructure/http/middlewares/request-logger.ts`** – The metrics middleware that calls `incrementInflight`, `decrementInflight`, `getRouteLabel`, and `recordRequestMetric` on every request's start/finish.
- **`src/app/telemetry.ts`** – Top-level app wiring that ensures this module's side-effects (registry setup, default metrics) run at boot.
- **Module `metrics.ts` files** (`account`, `audit-logs`, `cart`, `inventory`, `orders`, `payments`, `persistence`) – Each registers its own domain counters/gauges against the same `metricsRegistry`, making them visible in `/metrics` and queryable by the overview endpoint without importing the owning module.
- **`src/infrastructure/observability/metrics-cache.ts`** / **`stream.ts`** – Sibling observability modules; likely share the registry or follow the same registration pattern.
- **`src/modules/observability/controllers/get-observability-metrics-overview.ts`** – Consumes `percentileFromHistogramBuckets`, `aggregateLatencyBuckets`, and `sumMetricValues` to build the JSON response for `GET /observability/metrics/overview`.
- **`src/modules/observability/routes.ts`** – Registers the overview endpoint that exercises the helpers above.
- **`src/modules/observability/tests/unit/metrics-overview.test.ts`** / **`routes.test.ts`** – Unit tests covering the overview controller's use of the histogram helpers and route wiring.

## Notes

- **Cardinality guard:** `route` is always a *template* (e.g. `/orders/:id`), never a raw path. `UNMATCHED_ROUTE` collapses all 404s into one series. Never derive a label from user-supplied path segments.
- **In-flight gauge is unlabelled and process-wide.** A missed `decrementInflight` (e.g. on a client-abort path that skips the `finish` listener) causes permanent upward drift.
- **`percentileFromHistogramBuckets` over-estimates** within a bucket (returns the upper boundary). This is intentional for the in-app overview; production alerting should use Prometheus `histogram_quantile` with interpolation.
- **`nodejs_heap_size_limit_bytes`** is distinct from prom-client's `nodejs_heap_size_total_bytes`. Use `used / limit` (not `used / total`) for OOM-pressure alerts; `total` grows on demand and keeps `used/total` near 1.
- **`request.route` is typed `any` by Express** and can be a RegExp or array for non-string routes. `getRouteLabel` guards with an `unknown` cast and returns `UNMATCHED_ROUTE` for anything that is not a plain string.
- **The file has module-level side-effects** (`collectDefaultMetrics`, Gauge construction). Importing it has observable consequences; it is designed to be imported once at startup, not lazily.
