---
source: src/modules/observability/openapi.yaml
sha256: 789d735b3f5cf1706012e1421e8599a967fbf97a6c1d1ecc0a3f3a76c98741f5
generated_at: 2026-11-08T06:40:22.407971+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the observability endpoints: a live SSE event stream, an authenticated health snapshot, Prometheus metrics (raw + JSON overview), and an incident-only audit log. It defines the request/response shapes, security requirements, and error semantics so that clients, scrapers, and dashboard consumers have a single source of truth.

## Key elements

- **Tag `Observability`** (`x-family: Core`) — groups all five operations; signals that protected routes require the admin role.
- **`GET /observability/events`** (`getObservabilityEvents`) — SSE stream (`text/event-stream`); emits `metrics.snapshot` on connect, then periodic `metrics.updated` / `heartbeat`. Authenticated via `cookieAuth` (HttpOnly refresh cookie) because `EventSource` cannot set an `Authorization` header.
- **`GET /observability/health`** (`getObservabilityHealth`) — Readiness detail for dashboards (uptime, memory, per-dependency status, telemetry wiring). Distinct from `/livez` and `/readyz`. Requires `bearerAuth` (admin).
- **`GET /observability/metrics`** (`getObservabilityMetrics`) — Prometheus exposition format 0.0.4 (`text/plain`). Authenticated via `metricsBearer` (static scraper credential). Returns `503` when no token is configured (fail-closed). `500` returns plain text, not `problem+json` (`x-not-problem: true`), because scrapers only parse exposition format.
- **`GET /observability/metrics/overview`** (`getObservabilityMetricsOverview`) — JSON KPI summary derived from the same counters/histograms; for dashboard cards. Requires `bearerAuth`.
- **`GET /observability/audit`** (`listObservabilityAuditEntries`) — Newest-first incident log (security refusals, failed sign-ins, replayed refresh tokens, disabled webhooks). IP fields are HMAC digests. Paginated via shared `PageParam`/`PageSizeParam`. Requires `bearerAuth`.
- **Schemas (components):**
  - `ObservabilityHealthTelemetry` — which telemetry sinks (loki, otel, umami, faro, analytics) are wired; deliberately separate from `status` because losing a sink costs visibility, not capability.
  - `DependencyStatus` — enum `ready | connecting | unavailable | disabled`; `disabled` is a supported state, not a failure.
  - `ObservabilityDependency` — per-backing-service status wrapper.
  - `ObservabilityHealth`, `ObservabilityMetricsSummary`, `AuditLogsResponse` — top-level response bodies (defined further in the file).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All shared `$ref` targets live here: `Unauthorized`, `Forbidden`, `ValidationError`, `Problem`, `CacheControlNoStore`, `PageParam`, `PageSizeParam`. This file never redefines them.
- **`src/modules/observability/module.yaml`** — Module manifest that lists this OpenAPI spec (alongside `asyncapi.yaml`, `authorization.yaml`) as the module's contract set.
- **`src/modules/observability/authorization.yaml`** — Defines or re-exports the security schemes consumed by this file (`cookieAuth`, `bearerAuth`, `metricsBearer`).

## Notes

- **SSE auth is cookie-only by design.** `EventSource` (the browser API that consumes this stream) cannot set custom headers; the HttpOnly refresh cookie is the sole credential. Any tool that needs header-based auth must read the stream differently.
- **Prometheus auth is a static bearer token**, not a JWT. The `503` response is intentional: the endpoint denies by default when the token is unset rather than falling back to open access.
- **`500` on `/observability/metrics` returns `text/plain`, not `application/problem+json`.** The `x-not-problem: true` extension marks this; a Prometheus scraper will choke on a JSON body.
- **Health ≠ liveness/readiness.** `GET /observability/health` is the rich, authenticated dashboard view. It does no I/O — all values come from adapter-held connection state.
- **Telemetry wiring is reported, not probed.** The `analytics` sub-object distinguishes "provider selected but unconfigured" from "deliberately collecting nothing" (`provider: none, configured: true`).
