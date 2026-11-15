---
source: src/modules/observability/openapi.yaml
sha256: 95decd1d752361e090f2154b3836016dfee8c25c5d4c3219b6a51735bf21c342
generated_at: 2026-11-14T20:29:20.815780+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the observability module. Defines the HTTP surface (SSE events, health, Prometheus metrics, JSON metrics overview, and incident audit) along with the schemas those endpoints produce, so consumers and tooling can discover and validate the API without reading implementation code.

## Key elements

- **`paths`** — Five read-only endpoints under `/observability/*`:
  - `GET /observability/events` — SSE stream (`text/event-stream`); authenticates via `cookieAuth` (HttpOnly refresh cookie, since `EventSource` cannot set headers).
  - `GET /observability/health` — Authenticated readiness/dependency snapshot; requires `bearerAuth` with scope `read:ObservabilitySnapshot`.
  - `GET /observability/metrics` — Raw Prometheus exposition (0.0.4) text; authenticates via a static `metricsBearer` credential (not a JWT). Returns `503` if no metrics token is configured.
  - `GET /observability/metrics/overview` — Derived JSON summary of key counters/histograms for dashboards; same bearer scope as health.
  - `GET /observability/audit` — Paginated incident log (security refusals, failed sign-ins, replayed tokens, disabled webhooks); supports `actor`, `action`, `outcome`, `since` filters plus shared `PageParam`/`PageSizeParam`.

- **`tags`** — Single tag `Observability` (x-family: Core) covering all operations.

- **`components.schemas`** — Module-local schemas: `ObservabilityHealthTelemetry`, `DependencyStatus` (enum: ready/connecting/unavailable/disabled), `ObservabilityDependency`, `ObservabilityHealth`, `ObservabilityMetricsSummary`, `AuditLogsResponse`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All shared building blocks (error responses `Unauthorized`, `Forbidden`, `ValidationError`; header `Cache-Control: no-store`; schema `Problem`; query parameters `PageParam`, `PageSizeParam`) are pulled in via relative `$ref`s into this file.
- **`src/modules/observability/authorization.yaml`** — Defines the roles/scopes (`read:ObservabilitySnapshot`, `metricsBearer`, `cookieAuth`) that this spec's `security` blocks reference at runtime.
- **`src/modules/observability/asyncapi.yaml`** — Covers the async/event-channel side (webhooks, message-bus events) for the same module; this file covers only the synchronous HTTP surface.
- **`src/modules/observability/module.yaml`** — Module manifest that ties together this OpenAPI spec, the AsyncAPI spec, and the authorization config.
- **`src/modules/notifications/openapi.yaml`** — Sibling module contract with the same structural conventions (shared-root refs, per-module schemas); useful as a reference for cross-module patterns.

## Notes

- **Auth is endpoint-specific, not uniform.** SSE uses a cookie (browser `EventSource` constraint), Prometheus uses a static bearer (scraper cannot log in), and the remaining endpoints use a JWT bearer with the `read:ObservabilitySnapshot` scope. Do not assume one `security` scheme covers the module.
- **`/observability/metrics` returns Prometheus text, not JSON, even on error.** The `500` response is explicitly marked `x-not-problem: true` and carries `text/plain` so a scraper's parser never chokes on a problem+json body.
- **`DependencyStatus.disabled` is a valid, non-failure state.** It never degrades the overall `status` field, unlike `unavailable`.
- **Telemetry wiring is informational only.** `ObservabilityHealthTelemetry` reports which sinks are configured from environment; it is deliberately excluded from the `status` verdict because losing a sink costs visibility, not capability.
- **Audit log IPs are HMAC-digested** (`hmac:` + 12 hex chars) — comparable but not human-readable. Retention is deployment-configured (180 days default).
- **The file is truncated in the working copy** (`ObservabilityDependency` is cut mid-definition); the full schema list continues beyond what is visible here.
