---
source: src/modules/observability/openapi.yaml
sha256: d97f237417bf171372ef84c4ca2c7bccc3daafc6c2371edc2c4403a3de221be2
generated_at: 2026-09-23T18:56:39.220097+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the observability module. Defines the five endpoints (SSE event stream, readiness health, raw Prometheus metrics, JSON metrics overview, and audit log) along with their request/response schemas. Serves as the single source of truth for what the observability surface exposes, its auth requirements, and its error shapes.

## Key elements

- **`GET /observability/events`** (`getObservabilityEvents`) — SSE stream; emits `metrics.snapshot` on connect, then periodic `metrics.updated` and `heartbeat` events. Authenticated via HttpOnly refresh cookie (EventSource cannot send an `Authorization` header).
- **`GET /observability/health`** (`getObservabilityHealth`) — Readiness snapshot (not the container liveness probe). Reports per-dependency status, uptime, memory, and telemetry wiring. Requires admin bearer. Performs no I/O; reads state already held by adapters.
- **`GET /observability/metrics`** (`getObservabilityMetrics`) — Raw Prometheus exposition text (format 0.0.4). Guarded by a static scraper bearer token (`isMetricsScraper`), not the admin JWT. Returns `503` if no token is configured rather than falling open.
- **`GET /observability/metrics/overview`** (`getObservabilityMetricsOverview`) — Structured JSON derived from the same Prometheus counters/histograms, intended for dashboard KPI cards. Requires admin bearer.
- **`GET /observability/audit`** (`getObservabilityAuditLogs`) — Paginated, filterable (actor, action, outcome, `since`) list of persisted audit events. Requires admin bearer. `since` is an exclusive lower bound.
- **Schemas** — `ObservabilityHealthResponseEnvelope`, `ObservabilityMetricsSummaryResponseEnvelope`, `AuditLogsResponseEnvelope` (all follow the shared `success/status/message/data` envelope); `ObservabilityHealthTelemetry` (boolean per sink + analytics provider object); `DependencyStatus` enum (`ready | connecting | unavailable | disabled`).

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — The health endpoint reports the queue adapter's connection state as one of its `DependencyStatus` entries. The adapter maintains the state in-process; this file merely documents the shape of the response.
- **`src/infrastructure/persistence/lease.ts`** — Same pattern: the lease persistence layer's readiness appears in the health response's dependency list.
- **`src/modules/orders/openapi.yaml`** — Audit events include actions originating from the orders module (e.g. `order.created`). The audit endpoint is the read surface for those cross-module events; the orders module is a producer.

## Notes

- **Auth differs per endpoint.** SSE uses the refresh cookie; Prometheus uses a static bearer; the rest use admin JWT. Do not assume one mechanism applies to all.
- **Telemetry wiring ≠ readiness.** `ObservabilityHealthTelemetry` booleans (loki, otel, umami, faro, analytics) are deliberately excluded from the `status` field so an unreachable sink does not flip the health dot to "unavailable."
- **Analytics is an object, not a boolean.** It must distinguish "provider selected but credentials missing" from "provider is `none` (intentionally collecting nothing)."
- **`503` on `/metrics` is a design choice:** missing token → deny-by-default, not a transient error.
- **`GET /` is the liveness probe**, not `/observability/health`. The health endpoint is a richer readiness snapshot for dashboards.
- Shared response/parameter schemas are `$ref`'d from `shared/contracts/openapi.root.yaml`; they are not redefined here.
