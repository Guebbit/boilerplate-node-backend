---
source: src/modules/observability/services/health.ts
sha256: 08033d44a2ef13ab8dc4be93c93bd9b6f6ae2449a2ab41a65688a10e499963f0
generated_at: 2026-11-08T06:40:58.657671+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/health.ts

## Purpose

Builds the full JSON payload served at `GET /observability/health`. It aggregates dependency status, telemetry-sink wiring, process resources, and per-job / per-queue outcomes into a single `ObservabilityHealth` object. The assembly logic lives here (beside the sibling services it calls) rather than in the controller, so the payload shape co-locates with the readers it composes.

## Key elements

- **`buildObservabilityHealth(): Promise<ObservabilityHealth>`** — the sole export. Resolves `jobHealth()` and `queueHealth()` in parallel via `Promise.all`, then synchronously reads `processSnapshot()`, `dependencyHealth()`, and `resolveAnalyticsProvider()` to assemble the final object. The returned shape includes:
  - `status` — folded overall health from dependencies only (telemetry excluded).
  - `environment` — `nodeEnvironment()` or the literal string `'unset'`.
  - `dependencies` — `{ database, cache, queue }`, each an object `{ status }` for future extensibility.
  - `telemetry` — boolean flags for Loki, OTel, Umami, Faro, plus `analytics: { provider, configured }`.
  - `memory` — byte-denominated fields matching the SSE stream's vocabulary.
  - `system` — platform, CPU count, load average from `node:os`.
  - `jobs` / `queues` — delegated to sibling services.
  - `timestamp` — ISO-8601 string.

## Relationships

| Neighbor | Interaction |
|---|---|
| `services/dependency-health.ts` | Imports `dependencyHealth` (per-service status) and `overallStatus` (fold into one status). |
| `services/job-health.ts` | Imports `jobHealth` for the `jobs` array. |
| `services/parked-jobs.ts` | Imports `queueHealth` for the `queues` array. |
| `services/process-snapshot.ts` | Imports `processSnapshot` for uptime and memory. |
| `infrastructure/observability/analytics/index.ts` | Imports `resolveAnalyticsProvider` to report which analytics backend is active and whether it is configured. |
| `infrastructure/runtime/config.ts` | Imports `nodeEnvironment`, `loggingConfig`, `tracingConfig` for environment, service name, and OTel flag. |
| `infrastructure/observability/config.ts` | Imports `analyticsConfig` for the Umami host flag. |
| `modules/observability/config.ts` | Imports `observabilityConfig` for Loki and Faro flags. |
| `types/index.ts` | Imports the `ObservabilityHealth` interface that shapes the return value. |
| `services/index.ts` | Barrel re-export; this module is one of the services it exposes. |
| `tests/unit/health-identity.test.ts` | Unit-tests this module's output. |

## Notes

- **`telemetry` ≠ `dependencies`.** Telemetry entries are configuration booleans (is a sink *wired*), not reachability probes. A dead Loki does not degrade `status`; a dead database does. The split is intentional and named to prevent confusion.
- **`analytics.configured` vs. `provider`.** With three possible providers, a bare boolean can't distinguish "PostHog unconfigured" from "this deployment uses Umami." The `configured` flag closes that gap: a selected-but-uncredentialed provider discards events silently for the process lifetime.
- **`environment` fallback.** An undefined `NODE_ENV` is mapped to the string `'unset'` rather than left as `undefined`, per the `isRelaxedEnvironment` convention.
- **`dependencies` are objects, not strings.** Each entry is `{ status: … }` so that a latency or last-error field can be added additively without breaking the payload contract.
- **Memory units are bytes**, deliberately matching the four-field shape of the SSE live stream so dashboards can compare without unit conversion.
