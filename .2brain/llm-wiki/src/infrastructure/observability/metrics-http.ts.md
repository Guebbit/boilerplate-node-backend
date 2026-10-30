---
source: src/infrastructure/observability/metrics-http.ts
sha256: cb9745e775be48b77e7b7b85108cb843724107aabe7c6d423956f0f0fa6bcacb
generated_at: 2026-10-29T02:10:11.804268+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-http.ts

## Purpose

Defines the Prometheus HTTP metrics (RED + in-flight gauge) and the functions that record them per request. This is the *write* side only — the registry and process collectors live in `metrics-registry.ts`, and the JSON read-back for the overview endpoint lives in `http-readback.ts`.

## Key elements

- **`httpRequestsTotal`** (Counter) — total requests by `method`, `route`, `status_code`. The canonical RED numerator.
- **`httpRequestDuration`** (Histogram) — request duration in ms by `method`, `route`. Buckets are logarithmic (5 ms → 5 s). No `status_code` label to avoid bucket×status series explosion.
- **`httpRequestErrorsTotal`** (Counter) — 4xx/5xx responses by `method`, `route`, `status_code`. A convenience aggregate; alerting rules prefer filtering `httpRequestsTotal` instead.
- **`httpInflightRequests`** (Gauge) — unlabelled live request count. Sustained growth signals saturation.
- **`UNMATCHED_ROUTE`** — constant (`'unmatched'`) used as the route label when no Express route matched, bounding cardinality against path-scanning.
- **`getRouteLabel(request)`** — resolves the mounted Express route template (via `routeTemplateOf` + `baseUrl`), normalizes trailing slashes, falls back to `UNMATCHED_ROUTE`.
- **`recordRequestMetric(input)`** — single call-site for one completed request: increments the total counter, observes the duration histogram, and conditionally increments the error counter.
- **`incrementInflight()` / `decrementInflight()`** — paired gauge ops; must bracket the full request lifecycle including error and abort paths.

## Relationships

- **`metrics-registry.ts`** — supplies the shared `Registry` instance every metric registers into; also hosts `getPrometheusMetrics` for exposition.
- **`metric-config.ts`** — supplies `counterConfig`, `gaugeConfig`, `histogramConfig` (name, help, labels, unit) applied via spread into each metric constructor.
- **`metrics.generated.ts`** — supplies `infrastructureMetricData` with the authoritative metric identifiers consumed by those config helpers.
- **`request.ts`** — `routeTemplateOf(request)` extracts the matched route template, which `getRouteLabel` composes with `request.baseUrl`.
- **`request-logger.ts`** — the Express middleware that calls `incrementInflight` on request start and `recordRequestMetric` + `decrementInflight` on `finish`.
- **`http-readback.ts`** — queries the counters/histogram/gauge defined here and shapes them into the JSON payload for the overview endpoint.
- **`telemetry.ts`** — app-level wiring that initialises the observability stack including this module.
- **`metrics-http.test.ts`** — unit tests covering `getRouteLabel` edge cases and `recordRequestMetric` label/bucket behaviour.

## Notes

- **Cardinality is a one-way door.** `prom-client` never evicts a time series. The route label must always be a template (or `unmatched`); never a raw `request.path`.
- **Trailing-slash normalisation.** `getRouteLabel` strips a trailing `/` (except for the root `/`) so that `router.get('/')` mounted at `/orders` produces one series, not two.
- **In-flight gauge drift.** A missed `decrementInflight` (e.g. on an unhandled error or client abort) causes permanent upward drift. The middleware must guarantee the decrement on every exit path.
- **Object parameter.** `recordRequestMetric` takes a single `RequestMetricInput` object rather than four positional args, preventing accidental method/route transposition.
- **Histogram label set is intentionally narrower** than the counter's — no `status_code` — because each bucket would otherwise multiply the series count.
