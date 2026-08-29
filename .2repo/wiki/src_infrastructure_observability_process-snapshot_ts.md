# src/infrastructure/observability/process-snapshot.ts

## Purpose

Provides a single atomic reading of process memory and uptime so that every observability payload is built from the same instant. Without it, three independent calls to `process.memoryUsage()` / `process.uptime()` could disagree on rounding or timing across the SSE stream and the two REST endpoints.

## Key elements

- **`ProcessMemorySnapshot`** (interface) — four byte-valued fields: `rss`, `heapUsed`, `heapTotal`, `external`. Deliberately excludes `arrayBuffers` and any future Node additions.
- **`ProcessSnapshot`** (interface) — `{ uptimeSeconds: number; memory: ProcessMemorySnapshot }`. `uptimeSeconds` is a floored integer.
- **`processSnapshot()`** (exported const) — calls `process.memoryUsage()` and `process.uptime()` back-to-back, maps the four memory fields individually (no spread), floors the uptime, and returns a `ProcessSnapshot`.

## Relationships

- **`src/infrastructure/observability/stream.ts`** — consumes `processSnapshot()` to build each SSE frame.
- **`src/modules/observability/controllers/get-observability-health.ts`** — consumes `processSnapshot()` for the health endpoint payload.
- **`src/modules/observability/controllers/get-observability-metrics-overview.ts`** — consumes `processSnapshot()` for the metrics-overview endpoint payload.
- **`src/infrastructure/observability/metrics-http.ts`** — explicitly does **not** use this module. It reads `process.uptime()` inside a prom-client `Gauge.collect()` at scrape time, a different semantic contract. A cross-cutting test (`tests/cross-cutting/process-snapshot.test.ts`) permits that one direct call and forbids all others in `src/`.

## Notes

- **Bytes, not megabytes.** The snapshot reports raw bytes. Converting to MB (or any other unit) is a presentation-layer concern; doing it here would lose precision that dashboard differencing depends on.
- **Floor, not round.** `uptimeSeconds` uses `Math.floor`. The doc comment states this so that endpoints polled simultaneously never report a one-second discrepancy from a rounding mismatch.
- **No spread of `memoryUsage()`.** Fields are copied one-by-one so that `arrayBuffers` (present in Node ≥16) and any future additions never leak into the wire contract.
- **Atomicity guarantee.** Both underlying calls execute consecutively inside `processSnapshot()`, so every number in one snapshot describes the same instant — a property three separate call sites cannot offer.
