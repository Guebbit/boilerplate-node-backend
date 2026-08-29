# src/modules/observability/openapi.yaml

## Purpose
OpenAPI 3.0.3 contract (v2.0.0) for the observability module. It defines five endpoints that expose operational visibility — SSE event stream, health snapshot, Prometheus metrics, a JSON metrics summary, and a paginated audit log — each with its own auth model suited to the consumer (browsers, Prometheus scrapers, or admin JWTs).

## Key elements
- **`GET /observability/events`** (`getObservabilityEvents`) — SSE stream sending `metrics.snapshot` on connect, then periodic `metrics.updated` and `heartbeat`. Auth via `isAdminViaCookie` (EventSource can't set headers).
- **`GET /observability/health`** (`getObservabilityHealth`) — Readiness snapshot with uptime, memory, dependency status, and telemetry-wiring detail. No I/O; reads existing connection state. Requires admin bearer token.
- **`GET /observability/metrics`** (`getObservabilityMetrics`) — Raw Prometheus exposition format (0.0.4). Auth via `isMetricsScraper` static bearer credential. Returns `503` if no token is configured (deny-by-default).
- **`GET /observability/metrics/overview`** (`getObservabilityMetricsOverview`) — JSON summary of key KPIs derived from Prometheus counters/histograms, for dashboard cards. Requires admin bearer token.
- **`GET /observability/audit`** (`getObservabilityAuditLogs`) — Paginated, filterable audit trail (actor, action, outcome, since). 90-day retention by default. Requires admin bearer token.
- **`ObservabilityHealthTelemetry`** — Boolean wiring flags for Loki, OTEL, Umami, Faro, and a structured `analytics` object (provider + configured). Intentionally excluded from readiness `status` because losing a telemetry sink costs visibility, not capability.
- **`DependencyStatus`** enum — `ready | connecting | unavailable | disabled`, used uniformly for backing-service state.
- **Envelope schemas** (`ObservabilityHealthResponseEnvelope`, `ObservabilityMetricsSummaryResponseEnvelope`, `AuditLogsResponseEnvelope`) — all follow the `{ success, status, message, data }` shape with `additionalProperties: false`.

## Relationships
- **`shared/contracts/openapi.root.yaml`** — Every error response (`Unauthorized`, `Forbidden`, `InternalError`, `ValidationError`), the shared envelope fields (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`), and the pagination parameters (`PageParam`, `PageSizeParam`) are `$ref`-imported from the root contract. This file never redefines them.

## Notes
- Three distinct auth models coexist in one file: cookie-based (SSE), static-scraper-token (Prometheus), and admin JWT (health, overview, audit). Adding a new endpoint requires picking the correct guard explicitly.
- `/observability/health` is **readiness**, not liveness. The liveness probe is `GET /`, called by the container `HEALTHCHECK`.
- The `503` on `/observability/metrics` is a deliberate design choice: an unconfigured metrics token is treated as "refuse to serve," not "serve anonymously."
- `ObservabilityHealthTelemetry` reads from environment configuration only; it never probes remote services. This keeps the health endpoint I/O-free.
- The audit `since` filter is an **exclusive** lower bound (strictly after), not inclusive.
