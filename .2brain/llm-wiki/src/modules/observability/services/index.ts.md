---
source: src/modules/observability/services/index.ts
sha256: 29a9ba782612f86acfbd515739b18cf0fe5102dff9d31207ed141fe556a5de80
generated_at: 2026-10-29T04:36:14.235770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/index.ts

## Purpose

Barrel module for the observability services layer. It re-publishes every service function and probe into a single `observabilityService` object so that controllers and the module root (`src/modules/observability/index.ts`) can import from one stable entry point rather than reaching into individual service files.

## Key elements

- **`observabilityService`** – The sole value export. An object bundling:
  - `buildObservabilityPayload` / `streamObservabilityMetrics` (from `./stream`)
  - `buildObservabilityHealth` (from `./health`)
  - `jobHealth` (from `./job-health`)
  - `dependencyHealth` / `overallStatus` (from `./dependency-health`)
  - `processSnapshot` (from `./process-snapshot`)
  - `queueHealth` (from `./parked-jobs`)
- **Re-exported types** – `DependencyHealth`, `ProcessMemorySnapshot`, `ProcessSnapshot` (type-only, via `export type`).

## Relationships

- **Consumed by controllers** – `get-observability-events.ts`, `get-observability-health.ts`, and `get-observability-metrics-overview.ts` import `observabilityService` (or its members) to build route responses.
- **Re-exported upward** – `src/modules/observability/index.ts` surfaces this barrel so the module's public API stays flat.
- **Composes lower-level services** – `health.ts` itself aggregates `job-health.ts` (lease side), `dependency-health.ts` (adapter side), and `parked-jobs.ts` (queue side); `process-snapshot.ts` is the shared process-reader underneath all of them.
- **Tested indirectly** – `tests/unit/get-observability-events.test.ts` exercises code paths that flow through this barrel.

## Notes

- All imports here are **named value imports**; the type re-exports use `export type` to avoid pulling type-only modules into runtime bundles.
- The JSDoc header documents the *composition* of `buildObservabilityHealth` (lease + adapter + queue) and identifies `process-snapshot.ts` as the single shared reader—useful context when modifying any one of the three sub-health builders.
- Adding a new service function to this module means updating both the import list **and** the `observabilityService` object literal; there is no automatic spread.
