---
source: src/infrastructure/observability/metrics-http.ts
sha256: bc2c4b38c44045eb98d2c6e99699fdfd09e699c1c761544519ac772acacde476
generated_at: 2026-10-14T08:06:10.387160+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-http.ts

## Purpose

Defines and exports the Prometheus HTTP metrics (request counter, duration histogram, error counter, in-flight gauge) and the small helper functions used to record a completed request. The file only *defines and increments* the metrics; the registry they register against and the read-back logic that serializes them into JSON live elsewhere.

## Key elements

- **`httpRequestsTotal`** (Counter, `http_requests_total`) — total requests by `method`, `route`, `status_code`. The canonical RED numerator.
- **`httpRequestDuration`** (Histogram, `http_request_duration_milliseconds`) — duration in ms by `method`, `route`. Buckets: 5–5000 ms. No `status_code` label to avoid multiplying series by bucket count.
- **`httpRequestErrorsTotal`** (Counter, `http_request_errors_total`) — 4xx/5xx responses by `method`, `route`, `status_code`. Redundant with filtering `httpRequestsTotal`, but gives dashboards a ready-made error series.
- **`httpInflightRequests`** (Gauge, `http_requests_in_flight`) — unlabelled count of requests currently being processed by the process.
- **`UNMATCHED_ROUTE`** (`'unmatched'`) — constant label value for requests that matched no Express route; prevents unbounded cardinality from raw paths.
- **`getRouteLabel(request: Request): string`** — resolves the mounted route template (e.g. `/orders/:id`) via `routeTemplateOf`, prepends `request.baseUrl`, strips a trailing slash, and falls back to `UNMATCHED_ROUTE`. Must be called after Express routing (e.g. in a `finish` listener).
- **`recordRequestMetric(input: RequestMetricInput): void`** — increments the request counter, observes the histogram, and increments the error counter (if status ≥ 400) in one call.
- **`incrementInflight()` / `decrementInflight()`** — pair of gauge operations; must be called exactly once per request (including error/abort paths) to avoid drift.

## Relationships

- **`metrics-registry.ts`** — every metric instance registers itself against the shared `metricsRegistry` exported there. This file never owns the registry.
- **`@infrastructure/http/request` (`routeTemplateOf`)** — imported by `getRouteLabel` to read the Express route template off the request object.
- **`middlewares/request-logger.ts`** — the middleware that calls `incrementInflight`, `recordRequestMetric`, and `decrementInflight` on each request's `finish` event (per the module doc comment).
- **`modules/observability/http-readback.ts`** — reads the counters/histogram/gauge exported here to build the JSON body for `GET /observability/metrics/overview`.
- **`modules/observability/controllers/get-observability-metrics-overview.ts`** — the Express controller that invokes the read-back and returns the response.
- **`app/telemetry.ts`** — wires the observability stack (metrics, traces) at application boot; the test `tests/unit/app/telemetry.test.ts` exercises that wiring.
- **`tests/unit/infrastructure/observability/metrics-http.test.ts`** — unit tests for `getRouteLabel`, `recordRequestMetric`, and the inflight gauge helpers.

## Notes

- **Cardinality discipline:** `route` is always the matched *template* (e.g. `/orders/:id`), never the raw URL path. `UNMATCHED_ROUTE` caps the "no match" case to a single series. Do not introduce labels derived from user-supplied values.
- **Histogram label set is narrower** than the counters (`method`, `route` only — no `status_code`). Passing a `status_code` label to `httpRequestDuration.observe` would create a new series and be silently ignored or error.
- **In-flight gauge is unlabelled and process-wide.** A missed `decrementInflight` on any code path (including client aborts) causes permanent upward drift.
- **`getRouteLabel` reads `request.baseUrl` + `request.route`.** Both are populated only *after* Express routing completes, so the function must not be called before the request has been dispatched to a handler.
- Trailing-slash normalization (`/orders/` → `/orders`) is done here so that `router.get('/')` mounted at `/orders` does not create a duplicate series.
