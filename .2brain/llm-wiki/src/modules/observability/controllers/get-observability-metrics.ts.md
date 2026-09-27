---
source: src/modules/observability/controllers/get-observability-metrics.ts
sha256: 348f2d742818c3a048df51e0d229bbc512ed56187e38093ba96f7224f467d220
generated_at: 2026-09-27T15:04:19.365067+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-metrics.ts

## Purpose

Express controller that serves the `GET /observability/metrics` endpoint (the Prometheus scrape target). It returns metrics in the Prometheus exposition text format, or a valid-but-empty body on collection failure — never an HTML error page — so that a scraper never logs a format parse error on top of the underlying outage.

## Key elements

- **`getObservabilityMetrics`** (exported `const`) — Express `(req, res)` handler. Calls `getPrometheusMetrics()`, sets `Content-Type` from `metricsRegistry.contentType`, and sends the text. On rejection it logs via `logger.error` and responds `500` with the literal string `# metrics unavailable\n` (a syntactically valid empty exposition body).

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Source of `getPrometheusMetrics()` (the async collector) and `metricsRegistry.contentType` (the `Content-Type` header value).
- **`src/infrastructure/adapters/logger.ts`** — Provides the structured `logger` used to record collection failures.
- **`src/modules/observability/routes.ts`** — Upstream route file that mounts this handler at the `/observability/metrics` path (with a static-credential guard).
- **`src/modules/observability/tests/unit/get-observability-metrics.test.ts`** — Unit tests covering the success and failure paths of this handler.

## Notes

- The promise chain is fire-and-forget (`void … .then … .catch`); there is no `await`. This is intentional for an Express 4 async-less handler.
- The failure response body is hard-coded to `# metrics unavailable\n` — a valid (zero-metric) exposition text — specifically so Prometheus does not emit a secondary "parse error" log entry during a scrape.
- A `// Stryker disable next-line all` comment suppresses mutation testing on the `logger.error` line (the surrounding catch block is the meaningful mutation target).
- The request parameter is unused (`_request`); the endpoint is stateless and carries no query params.
