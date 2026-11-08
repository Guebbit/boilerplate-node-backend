---
source: src/modules/observability/services/process-snapshot.ts
sha256: b781e90e92dc97323e2597a49ef5d861258838b6cd3aee6767d014d31d5c4c14
generated_at: 2026-11-08T06:41:31.631555+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/process-snapshot.ts

## Purpose

Provides a single atomic reading of process memory and uptime so that three separate consumers (the SSE stream and two REST endpoints) publish numbers from the same instant. Without this, each consumer calling `process.memoryUsage()` and `process.uptime()` independently could produce values that disagree purely due to timing drift.

## Key elements

- **`ProcessMemorySnapshot`** (interface) — the four memory fields published everywhere: `rss`, `heapUsed`, `heapTotal`, `external`. All in bytes. Deliberately no `arrayBuffers` or other Node-provided fields.
- **`ProcessSnapshot`** (interface) — combines `uptimeSeconds` (integer, floored) with a `ProcessMemorySnapshot`.
- **`processSnapshot()`** (exported function) — calls `process.memoryUsage()` and `process.uptime()` back-to-back and returns a `ProcessSnapshot`. Fields are copied individually (not spread) to prevent future Node additions from leaking into the public contract.

## Relationships

- **`stream.ts`** — the SSE stream reads its per-tick process data from `processSnapshot()` rather than calling the `process` APIs directly.
- **`health.ts`** — one of the two REST endpoints that reads from `processSnapshot()` to report the same four memory fields and uptime.
- **`index.ts`** — the services barrel re-exports this module's types and function so consumers can import from the package root.

## Notes

- Uptime is always `Math.floor(process.uptime())` so every contract types it as `integer`; never use the raw float.
- The field-by-field copy (vs. spread) is intentional: `process.memoryUsage()` also returns `arrayBuffers`, which appears in no consumer contract. A spread would publish it and any field Node adds later.
- `metrics-registry.ts` is the one place that reads `process.uptime()` itself (required because its prom-client `Gauge` must answer at scrape time); it is **not** a consumer of this module.
