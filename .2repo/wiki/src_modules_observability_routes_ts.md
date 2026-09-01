# src/modules/observability/routes.ts

## Purpose

Defines the Express route table for the operator dashboard (mounted at `/observability`). It wires five read-only GET endpoints to their controllers and, per route, selects the authentication guard that matches the caller's capability — cookie-based auth for a browser `EventSource`, a static scraper credential for Prometheus, and the standard admin-JWT chain for normal API clients.

## Key elements

- **`router`** (exported) — the Express `Router` instance that `module.ts` mounts at `/observability`.
- **`GET /events`** — streams live observability metrics via SSE. Guarded by `isAdminViaCookie` because a browser `EventSource` cannot set an `Authorization` header. Delegates to `streamObservabilityMetrics`.
- **`GET /metrics`** — returns a Prometheus exposition-format payload. Guarded by `isMetricsScraper`. Calls `getPrometheusMetrics()`, sets the `Content-Type` from `metricsRegistry.contentType`, and logs + returns a 500 on failure.
- **`GET /health`** — standard admin-JWT chain (`getAuth → isAuth → isAdmin`); delegates to `getObservabilityHealth`.
- **`GET /metrics/overview`** — same admin chain; delegates to `getObservabilityMetricsOverview`.
- **`GET /audit`** — same admin chain; delegates to `getObservabilityAuditLogs`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth`, `isAuth`, `isAdmin`, and `isAdminViaCookie` guards applied to each route.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — exports `isMetricsScraper`, the dedicated guard for the Prometheus scrape endpoint.
- **`src/infrastructure/observability/metrics-http.ts`** — provides `getPrometheusMetrics()` and `metricsRegistry` (content type) used by `GET /metrics`.
- **`src/infrastructure/observability/stream.ts`** — provides `streamObservabilityMetrics`, the SSE handler for `GET /events`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is called in the `GET /metrics` catch block to record collection failures.
- **`src/modules/observability/controllers/*`** — the three controller functions (`getObservabilityHealth`, `getObservabilityMetricsOverview`, `getObservabilityAuditLogs`) are the terminal handlers for the JWT-guarded routes.
- **`src/modules/observability/module.ts`** — imports `router` and registers it on the application at the `/observability` prefix.
- **`src/modules/observability/tests/unit/routes.test.ts`** — unit-tests route wiring and guard selection for this file.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — asserts that the admin-JWT-guarded routes actually require auth.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — verifies no unguarded write routes exist in this router (all routes here are GET).

## Notes

- Guard choice is intentionally per-route, not shared: the file docblock explains that `/events` and `/metrics` serve callers (browser SSE, Prometheus) that cannot present a standard admin JWT. The other three routes use the conventional `getAuth → isAuth → isAdmin` chain.
- All five routes are read-only (`GET`); there are no write operations in this router.
- The `GET /metrics` handler is fire-and-forget (`void` + `.then`/`.catch`); it does not `await` inside an `async` handler, so a collector timeout relies on Express's default socket timeout rather than an explicit one.
- The `/events` and `/metrics` responses do not carry user data, but the file comment notes they expose operational details (volumes, latency, heap) and are therefore still behind admin-level guards.
