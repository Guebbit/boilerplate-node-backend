---
source: src/infrastructure/observability/metrics-http.ts
source_sha256: 90f39bb09380d32426cec03a5f837ff3861b16c07a8760609c157bc49054a517
context_sha256: 73d529bab1e3be398442984bdc358bbc05b902266e79d750aa75b307696377ce
generated_at: 2026-11-22T02:59:21.565359+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/metrics-http.ts

## Purpose
Defines and records the Prometheus HTTP request metrics: a request counter, a duration histogram, an error counter, and an in-flight gauge. These are always-on aggregates for dashboards and alerts, as opposed to per-request traces. This file only defines and records the metrics. The registry lives in `metrics-registry.ts`, and the read-back into JSON lives in `src/modules/observability/http-readback.ts`.

## Key elements
- `httpRequestsTotal`: a `Counter` of requests by `method`, `route` and `status_code`. It is the numerator for rate and error ratio.
- `httpRequestDuration`: a `Histogram` of request duration in milliseconds. It is labelled by `method` and `route` only, with no `status_code`.
- `httpRequestErrorsTotal`: a `Counter` of responses with status >= 400, using the same labels as `httpRequestsTotal`. It duplicates a status-filtered `httpRequestsTotal`, and `HighErrorRate` does not read it.
- `httpInflightRequests`: an unlabelled `Gauge` of requests currently being processed.
- `UNMATCHED_ROUTE`: the constant `'unmatched'`, used as the route label when no route matched.
- `getRouteLabel(request)`: returns the matched route template as `baseUrl + template`, with a trailing slash stripped and `/` kept as is. It returns `unmatched` when no route matched. It must be called after routing, so callers use it inside a `finish` listener.
- `recordRequestMetric({ method, route, statusCode, durationMs })`: increments the counter, observes the histogram, and increments the error counter if `statusCode >= 400`. It is called once per response.
- `incrementInflight()` / `decrementInflight()`: adjust the in-flight gauge.

## Relationships
- `src/infrastructure/observability/metric-config.ts`: its `counterConfig`, `histogramConfig` and `gaugeConfig` helpers build each metric's configuration from the metric data definitions.
- `src/infrastructure/observability/metrics-registry.ts`: every metric is registered on `metricsRegistry`.
- `src/infrastructure/http/request.ts`: `routeTemplateOf` supplies the route template that `getRouteLabel` uses.
- `src/modules/observability/http-readback.ts` and `src/modules/observability/controllers/get-observability-metrics-overview.ts`: the read-back reads these counters to build the `GET /observability/metrics/overview` JSON.
- `src/infrastructure/http/middlewares/request-logger.ts` and `src/app/telemetry.ts`: these are graph neighbors. The file itself says only that its recording functions are called by the metrics middleware on `finish`.
- `tests/unit/infrastructure/observability/metrics-http.test.ts`: the unit tests for this module.

## Notes
- **Cardinality:** `route` is always the matched template and never the raw path. prom-client never evicts series, so using raw paths would let scanners grow the registry without bound.
- **Gauge pairing:** every `incrementInflight()` needs exactly one `decrementInflight()`, including on error and client-abort paths. A missed decrement makes the gauge drift upward permanently.
- **Errors:** 4xx and 5xx are both counted as errors. Splitting client faults from server faults is left to queries over `status_code`.
- **Histogram buckets:** they are roughly logarithmic and tighter at the low end, because percentiles can only resolve to a bucket boundary.
