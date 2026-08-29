# src/modules/observability/routes.ts

## Purpose

Defines the Express router for all `/observability` endpoints. It wires each route to its controller or streaming handler and applies the appropriate authentication middleware, distinguishing between cookie-authenticated browsers, static-credential Prometheus scrapers, and JWT-authenticated admin API clients.

## Key elements

- **`router`** (exported) — `express.Router` instance that is presumably mounted by `module.ts` under the `/observability` path.
- **`GET /events`** — Opens a Server-Sent Events stream via `streamObservabilityMetrics`. Auth: `isAdminViaCookie` (browser `EventSource` cannot set headers).
- **`GET /metrics`** — Prometheus scrape endpoint. Calls `getPrometheusMetrics()`, sets `Content-Type` from `metricsRegistry.contentType`, and sends the serialized metrics. On failure, logs via `logger.error` and returns `500` with a Prometheus-parsable body (`# metrics unavailable\n`). Auth: `isMetricsScraper` (static credential).
- **`GET /health`** — Delegates to `getObservabilityHealth` controller. Auth: `getAuth → isAuth → isAdmin`.
- **`GET /metrics/overview`** — Delegates to `getObservabilityMetricsOverview` controller. Auth: `getAuth → isAuth → isAdmin`.
- **`GET /audit`** — Delegates to `getObservabilityAuditLogs` controller. Auth: `getAuth → isAuth → isAdmin`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Supplies the four auth middlewares (`getAuth`, `isAuth`, `isAdmin`, `isAdminViaCookie`) applied to the routes above.
- **`src/infrastructure/http/middlewares/security.ts`** — Supplies `isMetricsScraper`, the Prometheus-specific guard.
- **`src/infrastructure/observability/metrics-http.ts`** — Supplies `getPrometheusMetrics` (async collector) and `metricsRegistry` (content-type source) used by `GET /metrics`.
- **`src/infrastructure/observability/stream.ts`** — Supplies `streamObservabilityMetrics`, the SSE writer for `GET /events`.
- **`src/infrastructure/adapters/logger.ts`** — Supplies `logger` for the error path in `GET /metrics`.
- **`src/modules/observability/controllers/get-observability-health.ts`** — Handler for `GET /health`.
- **`src/modules/observability/controllers/get-observability-metrics-overview.ts`** — Handler for `GET /metrics/overview`.
- **`src/modules/observability/controllers/get-observability-audit.ts`** — Handler for `GET /audit`.
- **`src/modules/observability/module.ts`** — Consumes the exported `router` and registers it in the application (the only file in the graph not imported *by* this file).

## Notes

- **Three auth strategies coexist.** The split is dictated by the client capability: `EventSource` cannot set headers (hence cookie auth), Prometheus cannot log in (hence a static credential), and normal API clients use a Bearer JWT. Don't "simplify" these into one scheme.
- **`GET /metrics` is intentionally not behind JWT auth.** It is guarded by `isMetricsScraper` (a static shared secret). Any change to that middleware's credential mechanism will break Prometheus scrapes.
- **The 500 response body for `/metrics` is a Prometheus exposition-format comment** (`# metrics unavailable\n`), not a JSON error. This keeps the scraper from interpreting it as a valid (but empty) metrics document.
- **No user-specific data is served**, but the file's comment block flags these endpoints as reconnaissance-relevant (volumes, error rates, latency percentiles, uptime, heap). Treat auth changes to any of them as a security-sensitive change.
