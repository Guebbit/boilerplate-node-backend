---
source: src/modules/observability/services/process-snapshot.ts
source_sha256: 9fb08ffffd64ace47d9194472739d4bbe1434c31260b234a69e4ec433c87b84c
context_sha256: 894dced743f6054627818dab3f16f67fa86c03662609e9de4db6bd1ed62dfb36
generated_at: 2026-11-22T06:03:40.531417+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/services/process-snapshot.ts

## Purpose
Provides a single function that reads process memory and uptime together, so the SSE stream and two REST endpoints publish consistent numbers instead of each calling `process.memoryUsage()`/`process.uptime()` separately. All units are bytes (memory) and whole seconds (uptime).

## Key elements
- `ProcessMemorySnapshot` — interface with exactly four fields in bytes: `rss`, `heapUsed`, `heapTotal`, `external`.
- `ProcessSnapshot` — interface with `uptimeSeconds` (integer, floored) and `memory` (`ProcessMemorySnapshot`).
- `processSnapshot()` — calls `process.memoryUsage()` and `process.uptime()` back to back and returns a `ProcessSnapshot`. Memory fields are copied individually; uptime is passed through `Math.floor`.

## Relationships
The listed neighbors are `health.ts`, `stream.ts` and `index.ts`. The module comment says the SSE stream and two REST endpoints read from this file, which fits `stream.ts` and `health.ts`. The file itself imports nothing and does not show which neighbor consumes it. `index.ts` is presumably the barrel for the services directory, but its contents aren't visible here.

## Notes
- Fields are picked explicitly rather than spread, so `arrayBuffers` (and any field Node adds later) is not published, because none of the three contracts include it.
- Flooring uptime keeps it an `integer`, matching every contract and preventing two endpoints polled together from disagreeing.
- `metrics-registry.ts` deliberately does not use this file. It reads `process.uptime()` itself because its prom-client `Gauge` must compute its value at scrape time.
