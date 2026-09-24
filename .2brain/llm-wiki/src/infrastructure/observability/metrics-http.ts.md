---
source: src/infrastructure/observability/metrics-http.ts
sha256: ed08ffee8616cc9c0569660422eb051b1d5fcff376cf0d771f8f010dcf87bd69
generated_at: 2026-09-23T17:49:00.495280+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-http.ts

## Purpose

Defines the Prometheus HTTP request metrics (counters, duration histogram, in-flight gauge) and the helper functions that record them. This is the *define-and-record* layer only: the shared `prom-client` registry lives in `metrics-registry.ts`, and the read-back logic that serialises these metrics into the `GET /observability/metrics/overview` JSON lives in `modules/observability/http-readback.ts`.

## Key elements

- **`httpRequestsTotal`** (Counter) — total requests by `method`, `route`, `status_code`. The RED-metric numerator for rate and error-ratio queries.
- **`httpRequestDuration`** (Histogram, ms) — request duration by `method`, `route` only (no `status_code` to avoid multiplying series by bucket count). Buckets: 5, 10, 25, 50, 100, 250, 500, 1 000, 2 500, 5 000.
- **`httpRequestErrorsTotal`** (Counter) — 4xx/5xx responses by `method`, `route`, `status_code`. Redundant with `httpRequestsTotal` but keeps alerting rules simple.
- **`httpInflightRequests`** (Gauge, unlabelled) — live count of requests being processed; sustained growth signals saturation.
- **`UNMATCHED_ROUTE`** — constant `'unmatched'`, the single label value for any path the app does not serve (prevents unbounded cardinality).
- **`getRouteLabel(request)`** — resolves the mounted Express route template (via `routeTemplateOf`) and normalises the trailing slash; returns `UNMATCHED_ROUTE` when no route matched.
- **`recordRequestMetric(input)`** — increments the request counter, observes the duration histogram, and increments the error counter (for ≥ 400). Accepts a single `RequestMetricInput` object to prevent positional-arg transposition.
- **`incrementInflight()` / `decrementInflight()`** — pair to tick the in-flight gauge up/down.

## Relationships

- **`@infrastructure/http/request`** — imports `routeTemplateOf`, which `getRouteLabel` calls to read the Express-matched template from the request.
- **`@infrastructure/observability/metrics-registry`** — imports `metricsRegistry`; every metric in this file registers against it so they share one `prom-client` registry.
- **`src/infrastructure/http/middlewares/request-logger.ts`** — the metrics middleware that calls `incrementInflight` on request start and `recordRequestMetric` + `decrementInflight` on the `finish` event.
- **`src/modules/observability/http-readback.ts`** — reads the counters/histogram defined here and shapes them into the JSON returned by `get-observability-metrics-overview.ts`.
- **`tests/unit/infrastructure/observability/metrics-http.test.ts`** — unit tests for the helpers and recording logic.

## Notes

- **Cardinality guard:** the `route` label is always the *template* Express matched, never the raw request path. `UNMATCHED_ROUTE` collapses all 404/unknown paths into one series; without it a path-scanning attack would grow the registry without bound (prom-client never evicts series).
- **Trailing-slash normalisation:** `router.get('/')` mounted at `/orders` produces `/orders/`, which `getRouteLabel` strips to `/orders` so it does not become a second series. The root path `/` is the special case that is left as-is.
- **Gauge pairing:** `incrementInflight` / `decrementInflight` must be called exactly once per request (including error and client-abort paths). A missed `decrementInflight` causes the gauge to drift upward permanently.
- **Histogram label set is narrower** than the counters' by design — adding `status_code` would multiply the number of time series by the bucket count (10).
