---
source: src/modules/observability/services/index.ts
sha256: 29a9ba782612f86acfbd515739b18cf0fe5102dff9d31207ed141fe556a5de80
generated_at: 2026-11-08T06:41:06.933077+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/index.ts

## Purpose

Barrel file for the observability services layer. It aggregates every service function and shared type into a single `observabilityService` object so that controllers and the module-level barrel (`src/modules/observability/index.ts`) have one stable import point for all health, streaming, and snapshot logic.

## Key elements

- **`observabilityService`** (const) — the sole value export; a flat object bundling eight service members:
  - `buildObservabilityPayload` / `streamObservabilityMetrics` (from `stream.ts`) — SSE streaming and one-shot metrics payload.
  - `buildObservabilityHealth` (from `health.ts`) — full `/observability/health` response shape.
  - `jobHealth` (from `job-health.ts`) — lease-side health probes.
  - `dependencyHealth` / `overallStatus` (from `dependency-health.ts`) — adapter-side checks and roll-up.
  - `processSnapshot` (from `process-snapshot.ts`) — shared process-level reader (memory, CPU, uptime).
  - `queueHealth` (from `parked-jobs.ts`) — queue-side status for parked jobs.
- **Type re-exports** — `DependencyHealth`, `ProcessMemorySnapshot`, `ProcessSnapshot` are re-exported so consumers can `import type` them from this barrel without reaching into individual files.

## Relationships

- **Consumed by** the three observability controllers (`get-observability-events`, `get-observability-health`, `get-observability-metrics-overview`) and by `src/modules/observability/index.ts`, both of which import `observabilityService` (or its individual members) to wire routes.
- **Re-exports from** the six sibling service files (`stream.ts`, `health.ts`, `job-health.ts`, `dependency-health.ts`, `process-snapshot.ts`, `parked-jobs.ts`); this file adds no logic of its own beyond the aggregation object.
- **Tested indirectly** via `src/modules/observability/tests/unit/get-observability-events.test.ts`, which exercises the streaming path that flows through `streamObservabilityMetrics`.

## Notes

- The file is purely declarative — no side effects at import time beyond the named imports. Safe to import for tree-shaking in non-observability entry points.
- Because `observabilityService` is a single const, consumers can destructure (`const { jobHealth } = observabilityService`) or import the whole object; the individual named exports do **not** exist at the top level. Code that does `import { jobHealth } from './services'` will get `undefined`.
