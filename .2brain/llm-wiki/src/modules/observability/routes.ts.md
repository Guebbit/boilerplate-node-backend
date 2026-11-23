---
source: src/modules/observability/routes.ts
source_sha256: 65a2182a130dd84ea9c06ba10499342dfc5ca0571a0d989fdbf8c9682dbeb6d1
context_sha256: 1cc83350b62ab835edab84f07ce5f10a2191d9b2238bca448ec3344e0a85dd2d
generated_at: 2026-11-22T06:02:38.854380+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/routes.ts

## Purpose
Route table for the operator dashboard's observability endpoints, exported as an Express `router` (mounted at `/observability`). Guards are chosen per route rather than shared: `/events` and `/metrics` are called by clients that can't carry the ordinary admin JWT (a browser `EventSource` and a Prometheus scraper), while the other three routes use the standard admin auth chain.

## Key elements
- `router` — the Express `Router` holding all five routes.
- `GET /events` — live SSE stream. Guards: `requireAllowedOrigin`, then `requirePermissionViaCookie('read', 'ObservabilitySnapshot')`, then `getObservabilityEvents`.
- `GET /metrics` — Prometheus scrape. Guards: `isMetricsScraper` (static credential), then `getObservabilityMetrics`.
- `GET /health` — whether the instance can serve and what is missing. Chain: `getAuth`, `isAuth`, `requirePermission('read', 'ObservabilitySnapshot')`, then `getObservabilityHealth`.
- `GET /metrics/overview` — key operational numbers as JSON. Same admin chain, then `getObservabilityMetricsOverview`.
- `GET /audit` — a filtered page of audit events. Same admin chain, then `getObservabilityAuditLogs`.

## Relationships
- `@kernel/middlewares/authorizations` (`src/kernel/middlewares/authorizations.ts`) supplies `getAuth`, `isAuth`, `requirePermission` (JWT routes) and `requirePermissionViaCookie` (the SSE route).
- `@infrastructure/http/middlewares/origin` (`src/infrastructure/http/middlewares/origin.ts`) supplies `requireAllowedOrigin`, used only on `/events`.
- `./metrics-scraper` supplies `isMetricsScraper`, used only on `/metrics`.
- `./controllers/get-observability-*.ts` — one controller per route: health, metrics-overview, audit, metrics, events.
- `module.ts` is the module entry that mounts this router; `src/modules/observability/tests/unit/routes.test.ts` covers the route table.

## Notes
- All routes require the same permission, `read` on `ObservabilitySnapshot`, except `/metrics`, which uses the scraper credential instead.
- `/events` and `/metrics` are authenticated even though they carry no user data, because they expose request volumes, error rates, latency, login counters, uptime and heap, which is useful reconnaissance for an attacker.
- `/events` authenticates by cookie alone, so the origin check is there to stop pages on other origins from opening the stream.
- Further background on the pipeline is referenced from the file's header comment, but no matching file is part of this module's graph; see `src/modules/observability/module.ts` for how the module is wired.
