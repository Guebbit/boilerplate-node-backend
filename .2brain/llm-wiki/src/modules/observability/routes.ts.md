---
source: src/modules/observability/routes.ts
sha256: 14b467c19c82556f06da619e58d020d45f1ffe86bda2e57e50d7c1e42476ebec
generated_at: 2026-11-08T06:40:30.820237+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/routes.ts

## Purpose
Defines the five HTTP routes for the operator observability dashboard (mounted at `/observability`) and assigns a per-route authentication strategy. Guards are chosen individually rather than shared because the SSE and Prometheus endpoints are consumed by clients that cannot present a standard admin JWT.

## Key elements
- **`router`** (exported) — the sole export; an Express `Router` instance with five `GET` routes.
- **`/events`** — live SSE stream for the browser `EventSource`. Guarded by `requireAllowedOrigin` + `requirePermissionViaCookie('read', 'ObservabilitySnapshot')`. Delegates to `getObservabilityEvents`.
- **`/metrics`** — Prometheus scrape endpoint. Guarded by `isMetricsScraper` (static credential). Delegates to `getObservabilityMetrics`.
- **`/health`** — instance liveness / readiness details. Standard JWT chain (`getAuth` → `isAuth` → `requirePermission`). Delegates to `getObservabilityHealth`.
- **`/metrics/overview`** — key operational numbers as JSON. Standard JWT chain. Delegates to `getObservabilityMetricsOverview`.
- **`/audit`** — paginated, filterable audit events. Standard JWT chain. Delegates to `getObservabilityAuditLogs`.

## Relationships
- **`@kernel/middlewares/authorizations`** — supplies `getAuth`, `isAuth`, `requirePermission`, `requirePermissionViaCookie`; the first three are applied to the JWT-guarded routes, the last to `/events`.
- **`@infrastructure/http/middlewares/origin`** — supplies `requireAllowedOrigin`, applied only to `/events` to prevent cross-origin SSE access when the cookie is the sole credential.
- **`./metrics-scraper`** — supplies the `isMetricsScraper` guard used exclusively on `/metrics`.
- **`./controllers/get-observability-{health,metrics,metrics-overview,audit,events}`** — the five handler functions that each route delegates to.
- **`./module.ts`** — the module registration file that mounts this `router` at the `/observability` path.
- **`./tests/unit/routes.test.ts`** — unit tests exercising the route table and guard wiring.

## Notes
- The permission string `'ObservabilitySnapshot'` is shared across all five routes; only the *mechanism* of enforcement differs.
- `/events` requires **both** `requireAllowedOrigin` and the cookie permission — the origin check exists specifically because `EventSource` cannot send an `Authorization` header.
- Route order matters: `/metrics` is defined before `/metrics/overview` so that the more specific path is not swallowed.
- No `POST`/`PUT`/`DELETE` routes exist; this is a read-only surface.
