---
source: src/infrastructure/observability/metrics-http.ts
sha256: cb9745e775be48b77e7b7b85108cb843724107aabe7c6d423956f0f0fa6bcacb
generated_at: 2026-11-08T03:40:12.314993+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-http.ts

## Purpose
Defines and exposes four Prometheus metrics for HTTP request observation (total counter, duration histogram, error counter, in-flight gauge) plus the helper functions to record them. This file is the *definition and write* side only; serialization to the registry, read-back for the overview endpoint, and per-request tracing live elsewhere. It exists so that a single import gives the middleware everything needed to stamp a completed request into the process-wide registry.

## Key elements
- **`httpRequestsTotal`** (Counter) — total requests by `method`, `route`, `status_code`; the RED-metric numerator.
- **`httpRequestDuration`** (Histogram) — request duration in ms by `method`, `route`; deliberately omits `status_code` to avoid bucket × status cardinality blow-up.
- **`httpRequestErrorsTotal`** (Counter) — 4xx/5xx responses; a convenience pre-filter over `httpRequestsTotal`.
- **`httpInflightRequests`** (Gauge) — unlabelled live request count; increases on start, decreases on finish.
- **`UNMATCHED_ROUTE`** — constant `'unmatched'`, the single label value for requests that hit no Express route (prevents unbounded cardinality from path-based labels).
- **`getRouteLabel(request)`** — resolves the mounted route template via `routeTemplateOf`, prepends `request.baseUrl`, strips a trailing slash, and falls back to `UNMATCHED_ROUTE`.
- **`recordRequestMetric({method, route, statusCode, durationMs})`** — increments the total counter, observes the histogram, and conditionally increments the error counter in one call.
- **`incrementInflight()` / `decrementInflight()`** — paired inc/dec on the in-flight gauge.

## Relationships
- **`src/infrastructure/http/request.ts`** — provides `routeTemplateOf`, the single source of truth for extracting the Express route template from a `Request` object.
- **`src/infrastructure/observability/metrics-registry.ts`** — provides the shared `metricsRegistry` instance into which all four metrics are registered; owns `getPrometheusMetrics` and process collectors.
- **`src/infrastructure/observability/metric-config.ts`** — supplies `counterConfig`, `histogramConfig`, `gaugeConfig` factory functions that inject generated metadata (name, help text, default buckets) from `metrics.generated.ts`.
- **`src/infrastructure/http/middlewares/request-logger.ts`** — the primary *consumer*: calls `incrementInflight` on request start and `decrementInflight` + `recordRequestMetric` on the `finish` event.
- **`src/modules/observability/http-readback.ts`** — reads the exported counters/gauge to build the JSON response for `GET /observability/metrics/overview`.
- **`tests/unit/infrastructure/observability/metrics-http.test.ts`** — unit tests for `getRouteLabel` and `recordRequestMetric`.

## Notes
- **In-flight gauge pairing is caller responsibility.** `incrementInflight` and `decrementInflight` are not tied together by the library; a missed decrement (error path, client abort) permanently inflates the gauge. The middleware must guarantee exactly one dec per inc.
- **`getRouteLabel` must be called after routing.** It reads `request.route` and `request.baseUrl`, which Express only populates during the routing phase. Calling it in an early middleware (before the router) will always return `UNMATCHED_ROUTE`.
- **Cardinality guard is structural, not runtime.** The design prevents unbounded series by using the *matched template* (finite set of routes) rather than the raw URL path. There is no runtime cardinality check; adding a new label derived from request data would silently break this.
- **Histogram label set is narrower than the counter's.** `httpRequestDuration` has no `status_code` label, so any PromQL query correlating duration with status must cross-join the two series externally.
