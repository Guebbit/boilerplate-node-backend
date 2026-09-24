---
source: src/modules/observability/controllers/get-observability-health.ts
sha256: 215b729cb10ccd42bb1892521c7bd127000634c90c6f1d63257605fd17f625f3
generated_at: 2026-09-23T18:55:34.741711+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-health.ts

## Purpose

Single-route controller for `GET /observability/health`. It assembles a **readiness** snapshot—dependency status, telemetry-sink configuration, process resources, and per-job/queue health—into one JSON payload. Readiness is deliberately distinct from liveness (`GET /`), so an orchestrator that restarts on liveness failure won't churn the process when the real problem is a downed Redis or Mongo.

## Key elements

- **`getObservabilityHealth(_request, response)`** — The sole export. Returns a `Promise` that resolves to a 200 `ObservabilityHealth` payload. Composes:
  - `dependencyHealth()` + `overallStatus()` — per-backing-service (database, cache, queue) status strings and a folded top-level `status` (`ok` / `degraded` / `down`).
  - `jobHealth()` — last outcome for every lease-guarded job (resolved in parallel via `Promise.all`).
  - `queueHealth()` (from `parked-jobs`) — dead-letter depth per worker queue (same parallel pair).
  - `processSnapshot()` — uptime, memory (bytes, four fields matching the SSE stream).
  - `resolveAnalyticsProvider()` — returns the selected provider's name and a `configured` boolean so `posthog: false` isn't ambiguous with "a different provider is active."
  - `os.platform()`, `os.cpus().length`, `os.loadavg()` — static system info.
  - Telemetry booleans read directly from `process.env` (Loki, OTel, Umami, Faro).
- Error handling is delegated to `catchAs(response, 'getObservabilityHealth')` in the `.catch` tail; success is written via `successResponse<ObservabilityHealth>(…)`.

## Relationships

- **`src/modules/observability/routes.ts`** — Registers this handler on the `GET /observability/health` path.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the uniform error-response helper used in the `.catch` clause.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the typed 200 writer.
- **`src/infrastructure/observability/analytics/index.ts`** — `resolveAnalyticsProvider()` returns the active provider object (name + `configured()` check).
- **`src/modules/observability/services/dependency-health.ts`** — Source of per-dependency status and the `overallStatus` fold.
- **`src/modules/observability/services/job-health.ts`** — Source of the `jobs` array.
- **`src/modules/observability/services/parked-jobs.ts`** — Source of the `queues` array (dead-letter depths).
- **`src/modules/observability/services/process-snapshot.ts`** — Source of `uptimeSeconds` and `memory`.
- **`src/types/index.ts`** — Defines the `ObservabilityHealth` return shape.

## Notes

- **Telemetry ≠ dependencies.** The `telemetry` block is deliberately excluded from the `overallStatus` fold: it reports *configuration* (env-var presence), not *reachability*. Losing Loki costs visibility, not capability, so it must not push `status` to `degraded`.
- **Dependencies are objects, not strings.** Each entry is `{ status: "ok" | "degraded" | "down" }` (or similar) rather than a bare string, so a `latencyMs` or `lastError` field can be added additively without a breaking payload change.
- **`telemetry` is not `integrations`.** The name is intentional to prevent a reader from treating this block as a live health check.
- **`analytics.configured` exists because provider selection and credential presence are independent.** A selected-but-uncredentialed provider silently discards events for the process lifetime; this field is the only place that condition surfaces.
- Memory is reported in **bytes**, matching the SSE feed's units, so dashboards can compare without unit conversion.
- `jobs` and `queues` are fetched with `Promise.all`; if either rejects, the whole `.catch` fires and no partial payload is sent.
