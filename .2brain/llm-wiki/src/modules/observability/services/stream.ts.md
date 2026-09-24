---
source: src/modules/observability/services/stream.ts
sha256: 95314a9eaea8ab89b70c99effb6638d895a54b5fd81aa305459935780cbe80c2
generated_at: 2026-09-23T18:57:43.556178+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/stream.ts

## Purpose

Implements a one-way Server-Sent Events (SSE) endpoint that pushes live process and HTTP metrics to a dashboard every 5 seconds. Chosen over WebSockets because the data is server→client only, it uses plain HTTP (no protocol upgrade), and the browser's built-in `EventSource` handles reconnection automatically.

## Key elements

- **`buildObservabilityPayload()`** (exported) — Assembles a single metrics snapshot (timestamp, uptime, memory, cumulative HTTP request/error counts, active SSE client count) conforming to the asyncapi.yaml schema. Reads `processSnapshot()` synchronously, then awaits `getHttpRequestCounters()`.
- **`streamObservabilityMetrics(response, reverify)`** (exported) — Opens the SSE stream on an Express `Response`: sets SSE headers, sends an immediate `METRICS_SNAPSHOT` frame, then schedules three intervals (5 s updates, 15 s heartbeat, 30 s permission re-check) and tears all down on `response.on('close')`.
- **`sseClients`** (module-private `Set<Response>`) — Tracks connected SSE clients per process; its `.size` is reported back in each payload as `realtime.sseClients`.
- **`writeEvent`** (module-private) — Writes one SSE frame (`event:` + `data:` + `\n\n`) to a response.
- **`writeMetricsEvent`** (module-private) — Fire-and-forget wrapper that builds a payload and writes it; swallows all rejections so a dead socket or failed read never crashes the interval loop.
- **Constants** — `UPDATE_INTERVAL_MS` (5 000), `HEARTBEAT_INTERVAL_MS` (15 000), `REVERIFY_INTERVAL_MS` (30 000).

## Relationships

- **`services/process-snapshot.ts`** — Calls `processSnapshot()` to obtain uptime and V8/heap memory fields for each payload frame.
- **`http-readback.ts`** — Calls `getHttpRequestCounters()` to read cumulative request/error totals since process boot.
- **`src/types/index.ts`** — Imports `OBSERVABILITY_CHANNELS` (channel-name constants shared with asyncapi.yaml), and the `ObservabilityMetricsPayload` / `ObservabilityChannel` types.
- **`routes.ts`** — The observability HTTP route calls `streamObservabilityMetrics`, wiring the `reverify` callback to the authorization middleware (`stillHoldsKeyViaCookie`).
- **`services/index.ts`** — Barrel module that re-exports the public API of this file.
- **`tests/unit/stream.test.ts`** — Unit-tests the payload shape, header settings, interval scheduling, and teardown behaviour.

## Notes

- The response is **never completed** by the server; teardown is exclusively driven by the `'close'` event (client disconnect, proxy timeout, or permission revocation calling `response.end()`).
- `reverify` is a plain `() => Promise<boolean>` callback so this module stays auth-agnostic. It fails **closed**: a thrown promise is treated the same as `false`.
- `writeMetricsEvent` intentionally uses `void` + `.catch(() => undefined)` to keep floating promises inside `setInterval` callbacks from becoming unhandled rejections that would crash the process.
- The `sseClients` count in the payload is self-referential by design: a leak (entries added but never removed) is visible as a climbing number on the very dashboard the stream feeds.
- HTTP counters are cumulative since boot; the **client** derives rates by differencing consecutive frames. Nothing is rounded to megabytes here for the same reason.
