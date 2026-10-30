---
source: src/modules/observability/openapi.yaml
sha256: 0b9af479cae800ff8623deb74952252a01ca916b74805d00ce12cdec8ba79a23
generated_at: 2026-10-29T04:35:54.734877+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/openapi.yaml

## Purpose

OpenAPI 3.1 contract for the observability module. It defines the wire-level API for operational endpoints—SSE event streams, health/readiness detail, Prometheus metrics, a JSON metrics overview, and incident-only audit logs—and documents their authentication requirements, response shapes, and error semantics for both consumers (dashboards, Prometheus, load balancers) and AI assistants reasoning about the system's surface.

## Key elements

- **`/observability/events` (GET)** – SSE stream (`text/event-stream`). Authenticated via `cookieAuth` because `EventSource` cannot set an `Authorization` header; the HttpOnly refresh cookie is the credential. Emits `metrics.snapshot` on connect, then periodic `metrics.updated` and `heartbeat` events.
- **`/observability/health` (GET)** – Authenticated (`bearerAuth`, admin role) readiness snapshot. Returns `ObservabilityHealth` with dependency statuses (database, cache, queue), telemetry wiring booleans, and uptime/memory detail. Explicitly *not* the liveness (`/livez`) or readiness (`/readyz`) probes.
- **`/observability/metrics` (GET)** – Raw Prometheus exposition format (0.0.4). Authenticated via a static `metricsBearer` token (not a JWT) because Prometheus cannot perform token refresh. Returns `503` if no token is configured; `500` is plain text (not a Problem body) for scraper compatibility.
- **`/observability/metrics/overview` (GET)** – Admin-authenticated JSON summary (`ObservabilityMetricsSummary`) derived from the same Prometheus counters/histograms, for dashboard KPI cards.
- **`/observability/audit` (GET)** – Admin-authenticated list of INCIDENT-only events (security refusals, failed sign-ins, replayed tokens, disabled webhooks). IP addresses are HMAC-keyed digests. Paginated; filterable by `actor`, `action`, `outcome`, `since`. Returns `AuditLogsResponse`.
- **`DependencyStatus`** – Enum: `ready | connecting | unavailable | disabled`. `disabled` is a valid configured state; `connecting` is distinct from `unavailable` to cover the startup grace window.
- **`ObservabilityHealthTelemetry`** – Booleans for each telemetry sink (Loki, OTel, Umami, Faro, analytics) read from environment; deliberately excluded from the `status` field because losing a sink costs visibility, not capability.
- **`ObservabilityDependency` / `ObservabilityHealthDependencies`** – Per-backing-service status objects (database, cache, queue) read from adapter connection state with no I/O.

## Relationships

- **`src/infrastructure/persistence/lease.ts`** – The audit-trail endpoint (`/observability/audit`) reads persisted incident events; lease management governs retention and expiry of those rows (90-day default).
- **`src/modules/orders/openapi.yaml`** – The audit description explicitly scopes this endpoint to *platform-operator* incidents and defers shop-admin customer actions (orders, payments, accounts) to the orders module's own `GET /audit`.
- **`src/infrastructure/adapters/queue.ts`** – Referenced as the `queue` entry in `ObservabilityHealthDependencies`; the health endpoint reports its status (`ready | connecting | unavailable | disabled`) from the adapter's existing connection state without opening new I/O.

## Notes

- Three distinct auth schemes coexist: `cookieAuth` (SSE only), `bearerAuth` (admin JWT for health/metrics-overview/audit), and `metricsBearer` (static token for Prometheus). Do not conflate them when reasoning about access control.
- The `500` on `/observability/metrics` is intentionally **not** a Problem JSON body (`x-not-problem: true`); Prometheus scrapers parse exposition text only.
- `/observability/health` performs zero I/O by design—every value is read from state adapters already maintain. Adding a probe or socket check here would violate the contract's stated invariant and could cause cascading latency under LB polling.
- The file references shared contracts at `../../../shared/contracts/openapi.root.yaml` for common responses (`Unauthorized`, `Forbidden`, `ValidationError`, `Problem`) and parameters (`PageParam`, `PageSizeParam`); those definitions live outside this file.
