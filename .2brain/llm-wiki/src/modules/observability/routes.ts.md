---
source: src/modules/observability/routes.ts
sha256: df1f89d1a5f8eabf3d1dae89b9a33ad7e7933052b18dc99f7142b4980368ba05
generated_at: 2026-09-23T18:56:53.692970+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/routes.ts

## Purpose

Express route table for the operator dashboard under `/observability`. Guards are assigned per-route (not shared) because the five endpoints serve callers with incompatible auth capabilities: a browser `EventSource`, a Prometheus scraper, and standard API clients.

## Key elements

- **`router`** (exported) — the `express.Router()` instance mounted at `/observability` by the observability module.
- **`OBSERVABILITY_READ_KEY`** — module-private constant (`platform.observability.any.read`) used as the single permission key for every route in this file.
- **`GET /events`** — SSE endpoint; guarded by `requirePermissionViaCookie`. Passes a periodic re-check callback (`stillHoldsKeyViaCookie`) to `streamObservabilityMetrics` so a revoked caller is cut off within 30 s even though the stream stays open.
- **`GET /metrics`** — Prometheus scrape endpoint; guarded by `isMetricsScraper` (static credential). Returns the output of `getPrometheusMetrics()` with the content type from `metricsRegistry.contentType`.
- **`GET /health`**, **`GET /metrics/overview`**, **`GET /audit`** — standard API routes guarded by the `getAuth → isAuth → requirePermission(OBSERVABILITY_READ_KEY)` chain; each delegates to its corresponding controller.

## Relationships

- **`@kernel/middlewares/authorizations`** — source of every auth middleware used (`getAuth`, `isAuth`, `requirePermission`, `requirePermissionViaCookie`, `stillHoldsKeyViaCookie`).
- **`./metrics-scraper`** — provides the `isMetricsScraper` guard for the `/metrics` scrape route.
- **`./controllers/get-observability-health`**, **`./controllers/get-observability-metrics-overview`**, **`./controllers/get-observability-audit`** — request handlers for the three standard-API routes.
- **`@infrastructure/observability/metrics-registry`** — provides `getPrometheusMetrics()` and `metricsRegistry.contentType` for the scrape endpoint.
- **`./services/stream`** — provides `streamObservabilityMetrics`, the SSE writer used by `/events`.
- **`@infrastructure/adapters/logger`** — used to log the error path in the `/metrics` catch block.
- **`./module.ts`** — mounts this router into the Express app as part of the observability module.
- **`tests/unit/routes.test.ts`** — unit tests for this file.
- **`tests/support/routed-modules.ts`** — registers this module for integration-test routing.

## Notes

- The `/events` route is the **only place in the codebase** where a permission revocation is not detected on the caller's "next request," because there is no next request until the periodic re-check (every 30 s via `stillHoldsKeyViaCookie`) tears down the stream.
- The `/metrics` route uses `void getPrometheusMetrics().then(...)` (fire-and-forget pattern) rather than `async/await`; the error is logged and a `500` body is sent. A Stryker comment disables mutation testing on that log line.
- The `request.cookies` cast to `Record<string, string | undefined>` and the non-null assertion (`jwt!`) in `/events` rely on `requirePermissionViaCookie` having already validated the cookie; the comment in the source documents this invariant.
