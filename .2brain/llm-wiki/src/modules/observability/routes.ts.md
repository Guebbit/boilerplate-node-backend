---
source: src/modules/observability/routes.ts
sha256: e1079f4df1dd1eef269701dd11f00c37761fb5b5efc4193803e2c990ddc00da0
generated_at: 2026-10-15T10:56:07.728319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/routes.ts

## Purpose

Defines the Express router for all five observability endpoints (mounted under `/observability`). Guards are assigned per-route rather than shared because the `/events` (SSE) and `/metrics` (Prometheus scrape) routes are called by clients that cannot present a standard admin JWT, while the remaining three routes use the usual authorization chain.

## Key elements

- **`router`** (exported) — the Express `Router` instance. The sole export of this module; consumed by the observability module for mounting.
- **`GET /events`** — SSE stream. Guarded by `requireAllowedOrigin` + `requirePermissionViaCookie(OBSERVABILITY_READ_KEY)`; handled by `getObservabilityEvents`.
- **`GET /metrics`** — Prometheus scrape target. Guarded by `isMetricsScraper`; handled by `getObservabilityMetrics`.
- **`GET /health`** — instance liveness/readiness. Standard `getAuth` → `isAuth` → `requirePermission(OBSERVABILITY_READ_KEY)` chain; handled by `getObservabilityHealth`.
- **`GET /metrics/overview`** — JSON summary of key operational numbers. Same standard auth chain; handled by `getObservabilityMetricsOverview`.
- **`GET /audit`** — paginated, filterable audit events. Same standard auth chain; handled by `getObservabilityAuditLogs`.
- **`OBSERVABILITY_READ_KEY`** — imported from the events controller; the shared permission identifier used by every route except `/metrics`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies all four auth middlewares (`getAuth`, `isAuth`, `requirePermission`, `requirePermissionViaCookie`) applied to the five routes.
- **`src/infrastructure/http/middlewares/origin.ts`** — supplies `requireAllowedOrigin`, which blocks cross-origin `EventSource` connections to `/events`.
- **`src/modules/observability/metrics-scraper.ts`** — supplies the `isMetricsScraper` guard that authenticates the Prometheus scrape on `/metrics` via a static credential.
- **`src/modules/observability/controllers/*`** (health, metrics-overview, audit, metrics, events) — each provides the final handler for its respective route. `get-observability-events` also exports `OBSERVABILITY_READ_KEY`, the permission constant referenced throughout this file.
- **`src/modules/observability/module.ts`** — mounts the exported `router` into the application.
- **`src/modules/observability/tests/unit/routes.test.ts`** — unit-tests the route definitions, guard ordering, and handler wiring in this file.

## Notes

- Guard ordering matters and is intentional: on `/events`, `requireAllowedOrigin` runs **before** the cookie check so that a cross-origin request is rejected before any session lookup. On the standard routes, `getAuth` → `isAuth` → `requirePermission` is the canonical sequence.
- `/events` and `/metrics` do **not** use the `getAuth`/`isAuth` pair at all — they rely entirely on their own auth mechanism (cookie / static credential). Do not add JWT guards to these routes.
- `OBSERVABILITY_READ_KEY` lives in the events controller, not in a shared constants file. All five routes that need a permission reference that same export.
- The file contains no POST/PUT/DELETE routes; the observability surface is read-only by design.
