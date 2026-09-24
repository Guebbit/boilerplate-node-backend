---
source: src/modules/observability/services/process-snapshot.ts
sha256: b781e90e92dc97323e2597a49ef5d861258838b6cd3aee6767d014d31d5c4c14
generated_at: 2026-09-23T18:57:32.378875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/process-snapshot.ts

## Purpose

Provides a single atomic read of process memory and uptime so that three consumers (the SSE stream and two REST endpoints) all publish numbers from the same instant. Without this, independent calls to `process.memoryUsage()` / `process.uptime()` across those consumers could drift and present as a bug. All values are in bytes; uptime is integer seconds.

## Key elements

- **`ProcessMemorySnapshot`** (interface) — the four memory fields published in every payload: `rss`, `heapUsed`, `heapTotal`, `external`.
- **`ProcessSnapshot`** (interface) — `uptimeSeconds` (floored integer) + `memory: ProcessMemorySnapshot`.
- **`processSnapshot()`** (exported function) — calls `process.memoryUsage()` and `process.uptime()` once, returns a `ProcessSnapshot`. Memory fields are picked individually (not spread) to exclude `arrayBuffers` and any future Node additions.

## Relationships

- **`get-observability-health.ts`** — REST endpoint that calls `processSnapshot()` to build its response.
- **`get-observability-metrics-overview.ts`** — REST endpoint that calls `processSnapshot()` to build its response.
- **`stream.ts`** — SSE stream that calls `processSnapshot()` on each tick.
- **`services/index.ts`** — barrel file that re-exports this module so the three consumers import from a single path.

## Notes

- The explicit field-by-field pick (vs. object spread) is intentional: `process.memoryUsage()` also returns `arrayBuffers`, which appears in none of the three public contracts. Spreading would leak it and any future Node field.
- `metrics-registry.ts` is the one known exception that reads `process.uptime()` directly, because its prom-client `Gauge` must answer at scrape time and cannot be pre-baked into a snapshot.
- Uptime is always `Math.floor`'d to keep the contract type `integer` consistent across all three payloads.
