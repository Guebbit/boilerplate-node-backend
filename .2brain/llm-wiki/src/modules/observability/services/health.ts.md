---
source: src/modules/observability/services/health.ts
sha256: 08033d44a2ef13ab8dc4be93c93bd9b6f6ae2449a2ab41a65688a10e499963f0
generated_at: 2026-10-15T10:56:21.338058+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/health.ts

## Purpose

Assembles the JSON payload served by `GET /observability/health`: dependency probe results, telemetry-sink configuration flags, process/system resources, and per-job outcomes. It lives in the services layer (not the controller) so the response shape is defined alongside the helpers that produce its fields.

## Key elements

- **`buildObservabilityHealth()`** (only export) — Returns `Promise<ObservabilityHealth>`. Awaits `jobHealth()` and `queueHealth()` in parallel, then synchronously calls `processSnapshot()`, `dependencyHealth()`, and `resolveAnalyticsProvider()` to build and return the full object.

## Relationships

- **`./dependency-health`** — calls `dependencyHealth()` for per-service probe status and `overallStatus()` to fold them into the top-level `status`.
- **`./job-health`** — calls `jobHealth()` for every lease-guarded job's last outcome.
- **`./parked-jobs`** — calls `queueHealth()` for each worker queue's dead-letter depth.
- **`./process-snapshot`** — calls `processSnapshot()` for uptime and memory figures.
- **`@infrastructure/observability/analytics`** — calls `resolveAnalyticsProvider()` to report which backend analytics provider is active and whether it is credentialed.
- **`@infrastructure/runtime/config`** — reads `nodeEnvironment`, `loggingConfig`, and `tracingConfig` for the `environment`, `service`, and `telemetry.otel` fields.
- **`../config`** (module-local) — reads `observabilityConfig()` for Loki and Faro endpoint presence.
- **`@infrastructure/observability/config`** — reads `analyticsConfig()` for the Umami origin.
- **`@types`** — imports the `ObservabilityHealth` return type.
- **`controllers/get-observability-health.ts`** — the HTTP controller that invokes this function and serialises the result.
- **`services/index.ts`** — barrel re-export so the module's public API is reachable from a single import path.
- **`tests/unit/health-identity.test.ts`** — unit tests targeting this module's output shape.

## Notes

- `telemetry` is deliberately **separate from** `dependencies` and is **excluded** from the `status` fold. It reports whether endpoints are configured (boolean reads off config), not whether they are reachable.
- Within `telemetry.analytics`, the `configured` boolean distinguishes "provider selected but missing credentials" from "a different provider is active." A misconfigured provider silently discards all events for the process lifetime, so this flag surfaces the gap.
- `memory` is reported in **bytes** (same units as the SSE live-feed stream) to avoid unit-conversion mismatch on dashboards.
- `environment` renders the literal string `'unset'` when `NODE_ENV` is absent, signalling a deployment context rather than a dev/test one.
- Only `jobHealth()` and `queueHealth()` are async; all other inputs are synchronous config reads or OS calls, so the single `Promise.all` is the sole await point.
