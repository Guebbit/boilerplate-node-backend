---
source: src/modules/observability/controllers/get-observability-metrics.ts
source_sha256: 42707b44fd7c4305b8c129131b56f2953adc7b309a7eb5944c9970fe725995bb
context_sha256: 9b140ee31a07a954db73875296f3ded189776ae3cedd099a2353fa27bf30ff43
generated_at: 2026-11-22T06:01:17.574153+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/controllers/get-observability-metrics.ts

## Purpose
Express controller for `GET /observability/metrics`, the Prometheus scrape endpoint. It replies with the metrics exposition text. If collection fails, it replies with a 500 in the same content type. Prometheus marks a scrape as failed (`up` = 0) from a non-200 status alone and never reads the body. The shared content type keeps the response consistent with the contract.

## Key elements
- `getObservabilityMetrics(_request, response)` is the only export. It is the request handler.
  - It sets the `Content-Type` header to `metricsRegistry.contentType` before collecting, so the success and error responses share one type.
  - It calls `getPrometheusMetrics()` and sends the result with `response.send`.
  - On rejection it logs the error, records it on the active span, and responds with status 500 and the body `# metrics unavailable\n`.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts` supplies `getPrometheusMetrics` (collects the exposition text) and `metricsRegistry` (whose `contentType` is used as the header value).
- `src/infrastructure/adapters/logger.ts` supplies `logger`, which logs `Failed to collect Prometheus metrics` with the error.
- `src/infrastructure/observability/tracer.ts` supplies `recordErrorOnActiveSpan`, which attaches the failure to the current trace span.
- `src/modules/observability/routes.ts` and `src/modules/observability/worker-routes.ts` are neighbors in the dependency graph, and presumably mount this handler. The file itself does not show how.
- `src/modules/observability/tests/unit/get-observability-metrics.test.ts` is the unit test for this controller.

## Notes
- The handler is not `async`. It starts the promise chain with `void`, so rejections are handled only by the `.catch` and never reach Express error handling.
- The doc comment says the route is guarded by a static credential. That guard is not implemented in this file.
- A `// Stryker disable next-line all` comment excludes the `logger.error` line from mutation testing.
- The module doc comment points to the section `#the-pipeline` of an observability documentation page for further background; see `src/modules/observability/module.ts` for the module itself.
