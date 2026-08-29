# docs/api/observability.md

## Purpose

API reference for the five `/observability/*` routes that expose operational data (health, KPIs, audit, SSE metrics, Prometheus text) for internal dashboards and monitoring scrapers. All routes are non-public and use one of three bespoke auth mechanisms rather than the standard admin JWT.

## Key elements

- **`GET /observability/events`** — SSE stream emitting a metrics snapshot every 5 s; guarded by `isAdminViaCookie`.
- **`GET /observability/metrics`** — Prometheus exposition format (`text/plain`); guarded by `isMetricsScraper` (`Bearer $NODE_METRICS_TOKEN`). Returns 503 when the token variable is unset.
- **`GET /observability/health`** — Full readiness snapshot: dependency statuses, memory (bytes), system info, telemetry wiring flags. `status` is `ok`/`degraded`.
- **`GET /observability/metrics/overview`** — Curated KPI JSON (HTTP totals, error rate, p50/p95 latency, auth & business counters) read from the same prom-client counters Prometheus scrapes.
- **`GET /observability/audit`** — Ring-buffer of security/access events with query filters (`actor`, `action`, `outcome`, `since`, `limit`).

## Relationships

- **`docs/api/endpoints.md`** — parent page listing all API routes; this file is the observability sub-section.
- **`docs/modules/observability.md`** — the module that implements the metrics collection these endpoints serve.
- **`docs/tools/observability-layer.md`** — explains the liveness (`GET /`) vs. readiness (`/observability/health`) split and the container HEALTHCHECK.
- **`docs/tools/prometheus.md`** — the scraper target for `/observability/metrics`; shares the same prom-client counters as `/metrics/overview`.
- **`docs/tools/grafana.md`** — dashboards that visualise the same underlying counters/histograms; the API endpoints are a point-in-time JSON equivalent.
- **`docs/tools/loki.md`** — ingests the same audit events (via Winston) that `/observability/audit` returns.
- **`docs/tools/winston.md`** — the transport layer that writes the audit trail consumed by both Loki and the audit endpoint.
- **`docs/tools/frontend-observability.md`** — primary consumer of the SSE `/observability/events` stream.
- **`docs/reference/src-infrastructure.md`** — source-level reference for the route definitions and guards.
- **`docs/reference/tests.md`** — test coverage for these endpoints.

## Notes

- **Auth is intentionally fragmented.** SSE cannot set an `Authorization` header (hence cookie), and a Prometheus scraper is not a user (hence a dedicated bearer token). Do not "unify" these to a single JWT.
- **`/observability/health` is readiness, not liveness.** `GET /` is the liveness probe used by the container HEALTHCHECK. Mixing them breaks deploy semantics.
- **`telemetry` flags are outside `status`.** An unreachable Loki degrades visibility, not capability, and must not flip `status` to `degraded`.
- **`memory` values are bytes**, matching the SSE stream's units. Downstream dashboards compare them directly without conversion.
- **`analytics.provider` vs. `analytics.configured`** are two independent facts. `provider: "none"` is always `configured: true`. The `telemetry.umami` boolean (public origin for the browser script) is a *different* fact from `analytics.provider: "umami"` (API-side collector selection).
- **`limit` on `/audit` clamps silently** (returns 200 with ≤ 200 events) rather than 422, unlike paged endpoints which reject out-of-range values. This endpoint has no pagination.
- **`NODE_METRICS_TOKEN` unset → 503 for everyone** on `/observability/metrics`. There is no fallback open mode.
