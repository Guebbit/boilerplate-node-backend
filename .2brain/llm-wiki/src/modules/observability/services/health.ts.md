---
source: src/modules/observability/services/health.ts
source_sha256: c67ac9a4fb1bd7f4ef86b6d2ab107005ea9f80c5fa40c8bc531fffe391e61f5d
context_sha256: 5d658aeaefb61bf4ac7cf009bff1159aa39fba998cc02cfeb94402ff8781d9e1
generated_at: 2026-11-22T06:03:05.055977+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/services/health.ts

## Purpose
Builds the payload for `GET /observability/health`: dependency state, telemetry sink configuration, process resources, and the last outcome of every lease-guarded job. It lives beside the other observability services so the payload's shape stays with the readers it assembles, not in the controller that serves it.

## Key elements
- `buildObservabilityHealth()`: the only export. It returns `Promise<ObservabilityHealth>`. It awaits `jobHealth()` and `queueHealth()` in parallel, then reads the process snapshot, dependency health and analytics provider synchronously.
- Payload fields:
  - `status`: derived from `overallStatus(dependencies)`.
  - `environment`: `nodeEnvironment()`, or `'unset'` if that is undefined.
  - `service`: `loggingConfig().NODE_SERVICE_NAME`.
  - `runtimeVersion`: `process.version`.
  - `uptimeSeconds` and `memory`: taken from the process snapshot.
  - `dependencies`: `database`, `cache` and `queue`, each as `{ status }`.
  - `telemetry`: see Notes.
  - `system`: `os.platform()`, CPU count and load average.
  - `jobs` and `queues`: passed through from the job and queue readers.
  - `timestamp`: an ISO string.

## Relationships
- `./dependency-health`: supplies `dependencyHealth()` and `overallStatus()`.
- `./job-health`: supplies `jobHealth()`, the last outcome of each crontab job.
- `./parked-jobs`: supplies `queueHealth()`, the dead-letter depth of each worker queue.
- `./process-snapshot`: supplies `uptimeSeconds` and `memory`.
- `@infrastructure/observability/analytics`: `resolveAnalyticsProvider()` gives the provider `name` and `configured()`.
- `@infrastructure/observability/config`: `analyticsConfig().NODE_UMAMI_HOST`.
- `@infrastructure/runtime/config`: `nodeEnvironment`, `loggingConfig` and `tracingConfig`.
- `../config` (`observabilityConfig`): `NODE_LOKI_HOST` and `NODE_FARO_COLLECTOR_URL`.
- `@types` (`src/types/index.ts`): the `ObservabilityHealth` type.
- `src/modules/observability/services/index.ts` and `src/modules/observability/tests/unit/health-identity.test.ts` are listed as graph neighbors. Their interactions are not visible in this file.

## Notes
- `status` folds only the backing services. A deployment with Mongo up and Redis down reports `degraded`.
- `telemetry` is deliberately separate from `dependencies` and is not part of the status fold. Losing a sink costs visibility, not capability.
- `telemetry` values are configuration flags read from the environment, not reachability probes:
  - `loki`, `otel`, `umami` and `faro` are booleans.
  - `umami` and `faro` describe frontend observability, not the backend's own analytics wiring.
  - `analytics` is `{ provider, configured }`. `configured` distinguishes a provider selected without credentials, which discards events, from a provider that was never selected.
- `dependencies` entries are objects rather than bare strings, so adding fields such as latency or last error is additive.
- `memory` is in bytes and uses the same four fields as the SSE stream, so the two can be compared directly.
- An unset `NODE_ENV` is reported as `'unset'` because it counts as a deployment (see `isRelaxedEnvironment`).
