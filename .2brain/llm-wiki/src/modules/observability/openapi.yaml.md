---
source: src/modules/observability/openapi.yaml
sha256: 034db9e1c4a0655b56083b684688f43a69a81c15719d471e1eae3308754a9aa2
generated_at: 2026-09-27T15:04:41.342651+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the observability module. It documents the five read-only endpoints that expose operational state (SSE event stream, detailed health, Prometheus metrics, JSON metrics summary, and audit logs) and pins the response schemas so clients and generated SDKs have a single source of truth for what the module returns.

## Key elements

- **`/observability/events` (GET)** — SSE stream (`text/event-stream`). Sends `metrics.snapshot` on connect, then periodic `metrics.updated` and `heartbeat` events. Authenticated via HttpOnly refresh cookie (`requireUnrestrictedViaCookie`) because `EventSource` cannot set an `Authorization` header.
- **`/observability/health` (GET)** — Detailed readiness snapshot for the dashboard card. Reports which backing dependency is down, uptime, memory, and telemetry-wiring status. Explicitly *not* the liveness (`GET /`) or container HEALTHCHECK (`GET /readyz`) probe. Requires admin bearer token.
- **`/observability/metrics` (GET)** — Raw Prometheus exposition (0.0.4) for scrapers. Authenticated by a static bearer credential checked via `isMetricsScraper`; returns **503** (deny-by-default) if the token env var is unset.
- **`/observability/metrics/overview` (GET)** — Same counters/histograms reshaped into structured JSON for KPI cards. Requires admin bearer token.
- **`/observability/audit` (GET)** — Paginated, filterable (`actor`, `action`, `outcome`, `since`) audit trail. Events retained ~90 days. `meta.totalItems` reflects all matching rows, not just the page. Requires admin bearer token.
- **Schemas** — `ObservabilityHealthResponseEnvelope`, `ObservabilityMetricsSummaryResponseEnvelope`, `AuditLogsResponseEnvelope` (all wrap data in the shared `{ success, status, message, data }` envelope); `ObservabilityHealthTelemetry` (boolean wiring flags for loki/otel/umami/faro + analytics provider/configured pair); `DependencyStatus` (`ready | connecting | unavailable | disabled`).

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — The queue adapter is one of the backing services whose `DependencyStatus` is surfaced inside the health endpoint's `data`. The spec describes it as a read from connection state the adapter already maintains (no I/O on the health call).
- **`src/infrastructure/persistence/lease.ts`** — Similarly appears as a backing-service entry in the health snapshot; its readiness/availability status is reported without probing.
- **`src/modules/orders/openapi.yaml`** — Audit-log `action` values (e.g. `order.created`) originate from the orders module's event emission. This spec documents the *shape* of those entries; the orders spec documents the *emission* side.

## Notes

- Every non-SSE, non-metrics endpoint uses the shared envelope pattern from `../../../shared/contracts/openapi.root.yaml`. The SSE and raw-Prometheus endpoints are the exceptions (plain `text/event-stream` / `text/plain`).
- Telemetry wiring (`ObservabilityHealthTelemetry`) is deliberately **excluded** from the readiness `status` field: an unreachable Loki degrades visibility, not serving capability, so it must not flip the dashboard dot.
- The `analytics` sub-object uses `{ provider, configured }` instead of a bare boolean to distinguish "provider selected but unconfigured" from "deliberately collecting nothing" (`provider: "none"` always reports `configured: true`).
- `since` on `/observability/audit` is an **exclusive** lower bound (strictly after the given timestamp).
