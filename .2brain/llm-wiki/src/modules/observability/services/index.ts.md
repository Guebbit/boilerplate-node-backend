---
source: src/modules/observability/services/index.ts
sha256: 309767dd3dd6243f6a9ae8b7e7ff1faaa2d75b9b9e3a6c4fef76a10e476ae45c
generated_at: 2026-09-23T18:57:09.949991+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/index.ts

## Purpose

Barrel file for the observability services directory. It re-publishes all service exports in a single entry point so consumers (primarily `src/modules/observability/index.ts`) can import from one path instead of reaching into individual files. Contains no logic of its own.

## Key elements

- `export * from './stream'` — re-exports the live SSE feed service.
- `export * from './job-health'` — re-exports the lease-side portion of `GET /observability/health`.
- `export * from './dependency-health'` — re-exports the adapter-side portion of `GET /observability/health`.
- `export * from './parked-jobs'` — re-exports the queue-side portion of `GET /observability/health`.
- `export * from './process-snapshot'` — re-exports the process-reader utility shared across all the above payloads.

## Relationships

- **`src/modules/observability/index.ts`** — the primary consumer; imports the aggregated service surface through this barrel.
- **`stream.ts`, `job-health.ts`, `dependency-health.ts`, `parked-jobs.ts`, `process-snapshot.ts`** — the five modules whose exports are re-exposed here. This file is purely a forwarding edge in the graph.

## Notes

- The health endpoint (`GET /observability/health`) is assembled from three separate service modules (job-health, dependency-health, parked-jobs) rather than living in one file. If you're looking for a single "health" implementation, it is split across those three.
- Because this file uses `export *`, name collisions between the five source modules would surface here, not at the individual module level.
