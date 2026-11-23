---
source: src/modules/observability/openapi.yaml
generated_at: 2026-11-22T06:02:26.708409+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract for the observability module (`version: 0.1.0`). It describes the operational endpoints (metrics, health, audit, live events) under a single `Observability` tag (`x-family: Core`). Per the tag description, protected endpoints require the admin role.

## Key elements
- `GET /observability/events` (`getObservabilityEvents`): Server-Sent Events stream for demo dashboards. Sends a snapshot event on connect, then periodic update and `heartbeat` events. Secured with `cookieAuth`; responds 200 (`text/event-stream`), 401, 403.
- `GET /observability/health` (`getObservabilityHealth`): detailed, authenticated readiness snapshot (uptime, memory, system, telemetry wiring, dependencies, jobs, queues). Needs `bearerAuth` with `read:ObservabilitySnapshot`. Returns `ObservabilityHealth`.
- `GET /observability/metrics` (`getObservabilityMetrics`): raw Prometheus text (exposition format 0.0.4) for scraping. Secured with `metricsBearer`. Responses: 200 `text/plain`, 401, 503 (no metrics token configured, `application/problem+json`), 500 (plain text, flagged `x-not-problem: true`).
- `GET /observability/metrics/overview` (`getObservabilityMetricsOverview`): JSON KPI summary for dashboards (`ObservabilityMetricsSummary`). Needs `read:ObservabilitySnapshot`.
- `GET /observability/audit` (`listObservabilityAuditEntries`): newest-first list of recent incident events from the persisted audit trail. Needs `read:ObservabilitySnapshot`. Query filters: `actor`, `action`, `outcome` (`success`/`failure`), `since` (exclusive date-time), plus shared `PageParam`/`PageSizeParam`. Returns `AuditLogsResponse`; also 401, 403, 422.
- Local schemas visible in the content:
  - `ObservabilityHealthTelemetry`: booleans `loki`, `otel`, `umami`, `faro`, and an `analytics` object (`provider`: `umami|posthog|none`, `configured`).
  - `DependencyStatus`: enum `ready|connecting|unavailable|disabled`.
  - `ObservabilityDependency`: defined further in the file.

## Relationships
- `asyncapi.yaml` and `authorization.yaml` are sibling contracts in the same module. The content shown does not reference either by `$ref`. The `read:ObservabilitySnapshot` scope used here and the SSE stream on `/observability/events` are the likely points of contact, but the visible content does not confirm this.

## Notes
- Shared error responses, the `Problem` schema, the `CacheControlNoStore` header and pagination parameters are `$ref`'d from `../../../shared/contracts/openapi.root.yaml`.
- Three distinct credentials are used:
  - `cookieAuth` for SSE, because `EventSource` cannot set an Authorization header (the HttpOnly refresh cookie is used, guarded by `requirePermissionViaCookie`).
  - `metricsBearer` for Prometheus (guarded by `isMetricsScraper`, a static bearer, since Prometheus cannot log in or refresh tokens).
  - `bearerAuth` with the `read:ObservabilitySnapshot` scope for the JSON endpoints.
- `/observability/metrics` denies by default with 503 when no token is configured.
- `/observability/health` is not the container liveness probe (`GET /livez`) or the load-balancer readiness probe (`GET /readyz`). Its `dependencies` perform no I/O and read adapter connection state, while `jobs` and `queues` read live.
- `DependencyStatus` `disabled` means "not configured" and never degrades overall `status`. `connecting` is kept separate from `unavailable` because the production HEALTHCHECK allows a start period.
- Telemetry sink flags reflect environment wiring, not probes, and are deliberately kept out of `status`.
- The audit endpoint covers only incidents (security refusals, failed sign-ins and second factors, replayed refresh tokens, disabled webhooks), not shop-customer activity. `ip` values are keyed HMAC digests, and entries are retained for 180 days by default. `meta.totalItems` counts all matching incidents, not just the returned page.
- The audit description says it requires the "platform operator's observability key", while the security declaration is `bearerAuth` with `read:ObservabilitySnapshot`.
