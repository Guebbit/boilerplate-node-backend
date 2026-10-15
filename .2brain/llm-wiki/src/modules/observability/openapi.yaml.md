---
source: src/modules/observability/openapi.yaml
sha256: 0d17dc79431a09d8a0af2972c2b3ec650933ac76ea4f84831fb9dd5338dc20f4
generated_at: 2026-10-15T10:55:56.268751+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the observability module. Defines the five operational endpoints (SSE event stream, detailed health snapshot, Prometheus metrics, JSON metrics overview, and platform-operator audit trail) along with their request/response schemas, security schemes, and shared-contract references. It exists so that API clients, dashboards, and documentation generators have a single source of truth for what this module exposes.

## Key elements

- **`GET /observability/events`** — SSE stream (`text/event-stream`). Sends `metrics.snapshot` on connect, then periodic `metrics.updated` and `heartbeat`. Authenticated via `cookieAuth` (HttpOnly refresh cookie) because `EventSource` cannot set an `Authorization` header.
- **`GET /observability/health`** — Authenticated, detailed readiness snapshot with uptime, memory, and telemetry-wiring detail. Explicitly **not** the container liveness (`/livez`) or LB readiness (`/readyz`) probe. Authenticated via `bearerAuth` (admin role).
- **`GET /observability/metrics`** — Prometheus exposition format 0.0.4 (`text/plain`). Authenticated via a dedicated `metricsBearer` scheme (static credential, not a JWT). Returns **503** (deny-by-default) if no metrics token is configured.
- **`GET /observability/metrics/overview`** — JSON KPI summary derived from the Prometheus counters/histograms, intended for dashboard cards. Requires admin role.
- **`GET /observability/audit`** — Pageable list of recent **INCIDENT** events (security refusals, failed sign-ins, replayed refresh tokens, disabled webhook subscriptions) from the persisted audit trail. Supports filters: `actor`, `action`, `outcome`, `since`, plus shared `PageParam`/`PageSizeParam`. Requires the platform operator's observability key.
- **`ObservabilityHealthTelemetry`** — Boolean flags (`loki`, `otel`, `umami`, `faro`, `analytics`) indicating which telemetry sinks are wired in this deployment. Read from environment; never probed. Deliberately kept **out of** the top-level `status` field because a lost sink costs visibility, not serving capability.
- **Response envelopes** (`ObservabilityHealthResponseEnvelope`, `ObservabilityMetricsSummaryResponseEnvelope`, `AuditLogsResponseEnvelope`) — Standard `{success, status, message, data}` wrapper referencing shared-envelope components.
- **Shared references** — Error responses, envelope fields, and pagination params are `$ref`'d from `../../../shared/contracts/openapi.root.yaml`.

## Relationships

- **`src/modules/orders/openapi.yaml`** — The audit endpoint's description explicitly contrasts this platform-operator incident view with the shop admin's `GET /audit` in the orders module (customer orders, payments, accounts). The two `audit` endpoints serve different roles and are not interchangeable.
- **`src/infrastructure/adapters/queue.ts`** — The health endpoint description states that "every dependency is read from the connection state its adapter already maintains," indicating the queue adapter's in-memory connection state is one of the backing-service signals surfaced by `GET /observability/health`.
- **`src/infrastructure/persistence/lease.ts`** — The audit endpoint reads from the "persisted audit trail." Lease-based persistence is the storage mechanism behind that trail; the OpenAPI contract describes the read side, while `lease.ts` implements the write/read storage.

## Notes

- **Three distinct auth schemes** are used across the five endpoints: `cookieAuth` (SSE only), `bearerAuth` (admin JWT for health/overview/audit), and `metricsBearer` (static credential for Prometheus). Mixing them up will cause 401s that are easy to misdiagnose.
- **Deny-by-default on `/observability/metrics`**: if the metrics token env var is unset the endpoint returns 503 rather than opening. This is intentional — an unauthenticated metrics endpoint is treated as a misconfiguration, not a fallback.
- **IP addresses in audit rows** are HMAC-digested (`hmac:` + 12 hex chars), comparable but not readable. Any code or dashboard that expects raw IPs will be wrong.
- **Telemetry wiring ≠ health**: the `ObservabilityHealthTelemetry` block is informational. A `false` on `loki` or `otel` does not flip the overall `success`/`status` to failure.
- **Retention**: audit entries expire after a deployment-configured period (default 90 days). `meta.totalItems` counts all matching incidents, not just the current page.
