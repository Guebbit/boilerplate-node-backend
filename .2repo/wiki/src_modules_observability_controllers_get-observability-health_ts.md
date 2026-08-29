# src/modules/observability/controllers/get-observability-health.ts

## Purpose

Handler for `GET /observability/health` — the **readiness** endpoint. It reports whether the instance can serve what it promises (database, cache, queue status) and which telemetry sinks are wired in, returning a single `status` (`ok` / `degraded` / `down`) folded from dependency health only. It is deliberately separate from liveness (`GET /`), which is what container `HEALTHCHECK` probes.

## Key elements

- **`getObservabilityHealth`** (exported) — Express controller that assembles and returns a JSON health payload via `successResponse`.
- **`dependencies`** block — per-service status (`database`, `cache`, `queue`) as objects (`{ status }`) so a latency or last-error field can be added later without a shape change.
- **`telemetry`** block — boolean flags for `loki`, `otel`, `umami`, `faro` (read from env vars) plus an `analytics` object (`provider` name + `configured` boolean). These are *configuration* indicators, not reachability probes, and are excluded from the `status` fold.
- **`memory`** block — sourced from `processSnapshot()`, reported in **bytes** to match the SSE stream's units.
- **`system`** block — `os.platform()`, `os.cpus().length`, `os.loadavg()`.

## Relationships

- **`src/infrastructure/http/response.ts`** — imports `successResponse` to wrap the payload.
- **`src/infrastructure/observability/dependency-health.ts`** — imports `dependencyHealth()` (per-service statuses) and `overallStatus()` (folds them into the top-level `status`).
- **`src/infrastructure/observability/process-snapshot.ts`** — imports `processSnapshot()` for uptime and memory figures.
- **`src/infrastructure/observability/analytics/index.ts`** — imports `resolveAnalyticsProvider()` to report which analytics backend is selected and whether it is credentialed.
- **`src/modules/observability/routes.ts`** — mounts this controller on the `GET /observability/health` route.

## Notes

- **Readiness ≠ liveness.** A down Redis makes this report `degraded`, but the container orchestrator acts on the liveness endpoint (`GET /`), not here. Do not conflate the two in monitoring alerts.
- **`telemetry` booleans are config flags, not probes.** `loki: true` means the env var is set; it does *not* mean Loki is reachable. The block was renamed from `integrations` specifically to stop it being read as a health check.
- **`analytics.configured`** exists because `provider: "posthog"` alone cannot distinguish "PostHog selected but missing credentials" from "a different provider is in use". Without it, a misconfigured deployment looked healthy.
- **Memory is in bytes, not megabytes**, deliberately matching the SSE stream so dashboards can compare without unit conversion.
- The `dependencies` objects (not bare strings) are a forward-compatibility choice: adding `latencyMs` or `lastError` per dependency is additive, not a breaking change.
