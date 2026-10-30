---
source: src/modules/observability/routes.ts
sha256: 14b467c19c82556f06da619e58d020d45f1ffe86bda2e57e50d7c1e42476ebec
generated_at: 2026-10-29T04:36:05.451102+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/routes.ts

## Purpose

Defines the Express route table for the operator dashboard under `/observability`. It wires five read-only endpoints to their controllers and attaches the correct authentication middleware per route. Guards are chosen individually (not shared) because two endpoints are consumed by callers that cannot carry a standard admin JWT: a browser `EventSource` (SSE) and a Prometheus scraper.

## Key elements

- **`router`** (export) — An Express `Router` instance mounted at `/observability` by the module. All five routes are registered on it.
- **`GET /observability/events`** — Live SSE stream. Guarded by `requireAllowedOrigin` → `requirePermissionViaCookie('read', 'ObservabilitySnapshot')` → `getObservabilityEvents`.
- **`GET /observability/metrics`** — Prometheus scrape endpoint. Guarded by `isMetricsScraper` → `getObservabilityMetrics`.
- **`GET /observability/health`** — Instance health/readiness. Standard JWT chain (`getAuth` → `isAuth` → `requirePermission('read', 'ObservabilitySnapshot')`) → `getObservabilityHealth`.
- **`GET /observability/metrics/overview`** — Key operational numbers as JSON. Same standard JWT chain → `getObservabilityMetricsOverview`.
- **`GET /observability/audit`** — Paginated, filterable audit events. Same standard JWT chain → `getObservabilityAuditLogs`.

## Relationships

- **`@kernel/middlewares/authorizations`** — Supplies `getAuth`, `isAuth`, `requirePermission`, and `requirePermissionViaCookie`; all five routes consume one or more of these.
- **`@infrastructure/http/middlewares/origin`** — Supplies `requireAllowedOrigin`, applied only to `/events` to block cross-origin SSE connections.
- **`./metrics-scraper`** — Supplies `isMetricsScraper`, the sole guard on `/metrics`.
- **Controllers (`get-observability-health`, `-events`, `-audit`, `-metrics`, `-metrics-overview`)** — Each is the terminal handler for its respective route.
- **`./module.ts`** — Consumes the exported `router` to mount these endpoints in the application.
- **`tests/unit/routes.test.ts`** — Unit-tests route registration, middleware ordering, and permissions for this file.

## Notes

- Authentication strategy is intentionally **per-route**, not a shared chain. `/events` uses a session cookie (SSE cannot set custom headers) plus an origin check; `/metrics` uses a static scraper credential; the remaining three use the standard `Authorization`-header JWT chain. Do not "simplify" by collapsing these into one guard.
- `/metrics` is the only route without a `requirePermission(...)` call — its security boundary is `isMetricsScraper` alone.
- All five routes are `GET`; there are no write or mutation endpoints in this module.
