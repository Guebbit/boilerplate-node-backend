# src/infrastructure/observability/process-snapshot.ts

## Purpose

Centralizes a single atomic reading of `process.memoryUsage()` and `process.uptime()` so that the three observability payloads (SSE stream and two REST endpoints) all report numbers taken at the same instant. Without this shared call site, separate reads taken microseconds apart would disagree for no functional reason.

## Key elements

- **`ProcessMemorySnapshot`** (interface) — Four byte-unit fields: `rss`, `heapUsed`, `heapTotal`, `external`. Intentionally narrower than `process.memoryUsage()`'s return type.
- **`ProcessSnapshot`** (interface) — Wraps `ProcessMemorySnapshot` plus `uptimeSeconds` (integer, floored).
- **`processSnapshot()`** (const arrow function, exported) — Calls `process.memoryUsage()` and `process.uptime()` back-to-back and returns a `ProcessSnapshot`. Explicitly maps four memory fields rather than spreading, so `arrayBuffers` (and any future Node fields) are excluded from the public shape.

## Relationships

- **`stream.ts`** — SSE stream endpoint; calls `processSnapshot()` to emit the per-tick memory/uptime payload.
- **`get-observability-health.ts`** — REST health endpoint; calls `processSnapshot()` for its response body.
- **`get-observability-metrics-overview.ts`** — REST metrics-overview endpoint; calls `processSnapshot()` for its response body.

All three consume the same exported function; none of them call `process.memoryUsage()` or `process.uptime()` directly.

## Notes

- **Deliberate field picking over spread.** `process.memoryUsage()` also returns `arrayBuffers`. The function maps fields individually so the public contract stays stable if Node adds further properties.
- **Uptime is floored to whole seconds** (`Math.floor`) so the value is always an integer, matching the `integer` contract type in all three payloads.
- **`metrics-http.ts` is the one consumer that does NOT use this file.** Its prom-client `Gauge` must read `process.uptime()` at Prometheus scrape time, so it calls the process API directly.
- Units are bytes throughout; no conversion to KiB/MiB happens here.
