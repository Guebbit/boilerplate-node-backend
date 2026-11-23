---
source: src/modules/observability/services/index.ts
source_sha256: 29a9ba782612f86acfbd515739b18cf0fe5102dff9d31207ed141fe556a5de80
context_sha256: c1000288e6dff6dc3187dd2fbfd500e130b800751c3d80ced023236fdac20b40
generated_at: 2026-11-22T06:03:14.434292+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/services/index.ts

## Purpose
Barrel file for the observability module's services. It re-publishes the live SSE feed, the full health payload builder, and the shared process reader behind a single `observabilityService` object, so the rest of the module imports from one place.

## Key elements
- `observabilityService`: a plain object exposing the module's payloads and probes:
  - `buildObservabilityPayload`, `streamObservabilityMetrics` (from `stream.ts`): the live SSE metrics feed.
  - `buildObservabilityHealth` (from `health.ts`): the full `GET /observability/health` payload.
  - `jobHealth` (from `job-health.ts`): the lease side of health.
  - `dependencyHealth`, `overallStatus` (from `dependency-health.ts`): the adapter side of health and overall status computation.
  - `queueHealth` (from `parked-jobs.ts`): the queue side of health.
  - `processSnapshot` (from `process-snapshot.ts`): the process reader shared by all payloads.
- Type re-exports: `DependencyHealth`, `ProcessMemorySnapshot`, `ProcessSnapshot`.

## Relationships
- Aggregates the sibling services `stream.ts`, `health.ts`, `job-health.ts`, `dependency-health.ts`, `parked-jobs.ts` and `process-snapshot.ts`. It contains no logic of its own.
- The controllers (`get-observability-events.ts`, `get-observability-health.ts`, `get-observability-metrics-overview.ts`) and the module's `index.ts` are graph neighbors that consume or re-export this service surface.
- `src/modules/observability/tests/unit/get-observability-events.test.ts` is a related unit test.

## Notes
- Only types are re-exported by name. Runtime access to the functions goes through the `observabilityService` object.
- Per the module doc, `health.ts` is built from `job-health.ts`, `dependency-health.ts` and `parked-jobs.ts`.
