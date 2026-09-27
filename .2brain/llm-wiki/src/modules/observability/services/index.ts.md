---
source: src/modules/observability/services/index.ts
sha256: c4b8034d7ce68f3abcfa2e244f89c3c9f4166a5028e66847a3034ce3bcaf3a66
generated_at: 2026-09-27T15:05:19.585518+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/index.ts

## Purpose

Barrel file for the observability services layer. It re-exports all service modules (health, job-health, dependency-health, parked-jobs, process-snapshot, stream) so that consumers can import from a single path (`.../observability/services`) rather than reaching into individual files.

## Key elements

- **Re-exports (star exports):** `stream`, `health`, `job-health`, `dependency-health`, `process-snapshot`, `parked-jobs` — all six service modules are re-published in full.
- No original logic, classes, or functions are defined here; the file is purely a re-export surface.

## Relationships

- **`src/modules/observability/index.ts`** — parent barrel; almost certainly imports from this file to expose the services sub-path.
- **`health.ts`** — the aggregate `GET /observability/health` payload; composed of data from the three sibling modules below.
- **`job-health.ts`** — provides the "lease side" data consumed by `health.ts`.
- **`dependency-health.ts`** — provides the "adapter side" data consumed by `health.ts`.
- **`parked-jobs.ts`** — provides the "queue side" data consumed by `health.ts`.
- **`process-snapshot.ts`** — shared process reader used by every other payload in this folder.
- **`stream.ts`** — the live SSE feed, independent of the health aggregate.

## Notes

- Because every export is a star re-export, name collisions between the six modules would surface as ambiguous exports at the consumer. Adding a new service file here requires adding a matching `export * from './new-module';` line.
- The docstring at the top of the file serves as the canonical description of how `health.ts` is composed; if that composition changes, the docstring should be updated alongside the code.
