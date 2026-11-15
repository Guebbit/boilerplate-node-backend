---
source: src/modules/observability/controllers/get-observability-metrics.ts
sha256: b16cc8b3f82382aee508446d9522b8795affc2e9f53f1519f9b9b9eefeb8a0d1
generated_at: 2026-11-14T20:29:06.969632+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-metrics.ts

## Purpose

Express controller for the `GET /observability/metrics` endpoint — the Prometheus scrape target. It returns the Prometheus exposition text format, and on collection failure returns a 500 in the same content type so Prometheus can mark the target `up = 0` from the status code alone without parsing the body.

## Key elements

- **`getObservabilityMetrics`** (exported) — The route handler. Sets `Content-Type` (from `metricsRegistry.contentType`) before the async chain so both the 200 and 500 responses share one type. Calls `getPrometheusMetrics()`; on success sends the metrics text, on failure logs the error, records it on the active span, and responds `500` with the literal body `# metrics unavailable\n`.

## Relationships

- **`src/modules/observability/routes.ts`** — Wires `getObservabilityMetrics` to the `GET /observability/metrics` route. The comment notes the route is "guarded by a static credential," a concern that lives outside this controller.
- **`src/infrastructure/observability/metrics-registry.ts`** — Provides `getPrometheusMetrics()` (the collection function) and `metricsRegistry.contentType` (the `Content-Type` header value).
- **`src/infrastructure/adapters/logger.ts`** — Used to log an error when metric collection throws.
- **`src/infrastructure/observability/tracer.ts`** — `recordErrorOnActiveSpan(error)` attaches the failure to the current span.
- **`src/modules/observability/tests/unit/get-observability-metrics.test.ts`** — Unit tests for this handler.

## Notes

- The handler is synchronous in signature (`void`) but kicks off an async chain with `void … .then().catch()`. Express will not await the returned promise; the response is sent from within the `.then`/`.catch` callbacks.
- `Content-Type` is deliberately set **before** the promise resolves so the 500 response carries the same header as the 200, keeping the contract uniform for the scraper.
- A `// Stryker disable next-line all` comment suppresses mutation testing on the `logger.error` line.
- The 500 body is the fixed string `# metrics unavailable\n`; it is not a JSON error envelope.
