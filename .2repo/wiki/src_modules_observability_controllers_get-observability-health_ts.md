# src/modules/observability/controllers/get-observability-health.ts

## Purpose

Handler for `GET /observability/health`. Assembles the **readiness** snapshot for this instance by pulling dependency state, telemetry-sink configuration, and process resource metrics from the `infrastructure/observability` layer, then sends a single JSON response. Readiness is deliberately distinct from liveness (`GET /`): an orchestrator acts on liveness, whereas this endpoint answers "which backing service is missing so the instance cannot fulfil its contract?"

## Key elements

- **`getObservabilityHealth(_request, response)`** — the sole export. Reads `processSnapshot()`, `dependencyHealth()`, `resolveAnalyticsProvider()`, and a handful of `process.env` values, then calls `successResponse` with a payload containing:
  - `status` — folded readiness (`ok` / `degraded` / `down`) from `overallStatus(dependencies)`.
  - `dependencies` — per-service objects (`database`, `cache`, `queue`) shaped as `{ status }` so that fields like `latencyMs` or `lastError` can be added without a breaking change.
  - `telemetry` — boolean config flags (`loki`, `otel`, `umami`, `faro`) read straight off env vars, plus an `analytics` sub-object with `provider` name and a `configured` check that catches "provider selected but credentials missing."
  - `memory` — byte-valued metrics from the process snapshot, matching the SSE stream's units.
  - `system` — `os.platform()`, `os.cpus().length`, `os.loadavg()`.

## Relationships

- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the single helper that serialises the payload and sets the HTTP status.
- **`src/infrastructure/observability/dependency-health.ts`** — source of per-dependency booleans (`database`, `cache`, `queue`) and `overallStatus()` which folds them into the top-level `status` field.
- **`src/infrastructure/observability/analytics/index.ts`** — `resolveAnalyticsProvider()` returns the active provider name and a `configured()` predicate; the controller embeds both under `telemetry.analytics`.
- **`src/infrastructure/observability/process-snapshot.ts`** — `processSnapshot()` supplies `uptimeSeconds` and the `memory` block.
- **`src/modules/observability/routes.ts`** — wires this handler to the `GET /observability/health` route.

## Notes

- **Readiness ≠ liveness.** This endpoint is *not* what the container `HEALTHCHECK` probes. Restarting the process (liveness action) cannot recover a downed Redis; that is the design rationale for the two separate endpoints.
- **`telemetry` booleans are config flags, not probes.** Each is a `Boolean(process.env.…)`. An unreachable Loki still reports `true` here. Do not add network calls to this block.
- **`analytics.configured`** exists to surface a specific failure mode: provider name set but credentials absent. Without it, the endpoint would report a provider name and look healthy while silently dropping every event.
- **Units:** `memory` is in **bytes** to stay comparable with the SSE metrics stream; do not convert to megabytes here.
- **Dependency objects** (`{ status: … }`) are intentionally object-wrapped rather than plain strings so that latency / last-error fields can be added per-dependency without a schema migration.
