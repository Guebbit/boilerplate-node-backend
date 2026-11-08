---
source: src/modules/observability/controllers/get-observability-metrics.ts
sha256: 348f2d742818c3a048df51e0d229bbc512ed56187e38093ba96f7224f467d220
generated_at: 2026-11-08T06:39:02.300173+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-metrics.ts

## Purpose
Express route handler for `GET /observability/metrics`, the Prometheus scrape endpoint. It returns metrics in Prometheus exposition format, or a valid empty body on collection failure — deliberately never an error page, so a scraper doesn't log a parse error on top of the outage.

## Key elements
- **`getObservabilityMetrics`** (exported) — Express `Request`/`Response` handler. Calls `getPrometheusMetrics()`, sets `Content-Type` from `metricsRegistry.contentType`, and sends the body. On rejection, logs the error and responds `500` with `# metrics unavailable\n` (a syntactically valid empty exposition).
- **`_request`** — intentionally unused parameter (Express signature requirement).

## Relationships
- **`@infrastructure/observability/metrics-registry`** — source of `getPrometheusMetrics()` (async collector) and `metricsRegistry.contentType` (MIME header value).
- **`@infrastructure/adapters/logger`** — used in the catch path to record the collection failure.
- **`src/modules/observability/routes.ts`** — registers this handler on the `/observability/metrics` route.
- **`src/modules/observability/tests/unit/get-observability-metrics.test.ts`** — unit tests covering the success and failure paths of this handler.

## Notes
- The `void` on the promise chain means the handler is fire-and-forget; Express does not await the response. This is safe here because the route is a terminal scraper endpoint with no downstream middleware expecting a return value.
- The failure response body (`# metrics unavailable\n`) is a valid Prometheus exposition document (a single comment line). This is intentional: an unparseable body would cause Prometheus to emit an additional "scrape parse error" alert, muddying the incident signal.
- `Stryker disable next-line all` suppresses mutation testing on the `logger.error` call (logging side-effects are out of scope for mutation coverage).
