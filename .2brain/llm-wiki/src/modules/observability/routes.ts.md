---
source: src/modules/observability/routes.ts
sha256: b62d3867cff3be65f8a6bb756e879cf958ce4f98eb026ed6eea236a7c43f3020
generated_at: 2026-09-27T15:04:50.169200+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/routes.ts

## Purpose

Defines the Express `Router` (exported as `router`) for all operator-dashboard endpoints under `/observability`. Each route is paired with an authentication guard appropriate to its caller, because the five endpoints are reached by three distinct client types: a browser `EventSource` (cookie auth), a Prometheus scraper (static credential), and standard API clients (admin JWT).

## Key elements

- **`router`** — the single export; an Express `Router` instance with five `GET` routes:
  - `GET /events` → `getObservabilityEvents` (SSE stream)
  - `GET /metrics` → `getObservabilityMetrics` (Prometheus scrape target)
  - `GET /health` → `getObservabilityHealth`
  - `GET /metrics/overview` → `getObservabilityMetricsOverview`
  - `GET /audit` → `getObservabilityAuditLogs`
- **Per-route guard selection** — `/events` uses `requirePermissionViaCookie(OBSERVABILITY_READ_KEY)`; `/metrics` uses `isMetricsScraper`; the remaining three use the standard `getAuth → isAuth → requirePermission(OBSERVABILITY_READ_KEY)` chain.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies the four middleware factories (`getAuth`, `isAuth`, `requirePermission`, `requirePermissionViaCookie`) applied to every route.
- **`src/modules/observability/metrics-scraper.ts`** — exports `isMetricsScraper`, the gate used only on `/metrics`.
- **Controllers** (`get-observability-health`, `get-observability-metrics-overview`, `get-observability-audit`, `get-observability-metrics`, `get-observability-events`) — each is the terminal handler for one route; `get-observability-events` also exports the `OBSERVABILITY_READ_KEY` permission constant used by every other route.
- **`src/modules/observability/module.ts`** — the module that mounts this `router` into the application.
- **`src/modules/observability/tests/unit/routes.test.ts`** — unit tests asserting route registration and guard ordering.
- **`tests/support/routed-modules.ts`** — test harness that incorporates routed modules (including this one) for integration-style tests.

## Notes

- Auth guards are deliberately chosen **per route**, not via a shared `router.use(...)`; the file's doc block explains the rationale (browser `EventSource` cannot set headers; Prometheus cannot log in).
- `/metrics` and `/events` are still authenticated—just not via JWT. Treating them as unauthenticated in tests or docs would be incorrect.
- `OBSERVABILITY_READ_KEY` is imported from the events controller rather than a shared constants file; if adding a new route, import it from the same source to keep a single definition.
