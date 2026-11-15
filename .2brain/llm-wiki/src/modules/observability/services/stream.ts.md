---
source: src/modules/observability/services/stream.ts
sha256: dd361b9e3ae2ef094f1a2a859bc899ad3778b602c938d9330078c3b421cd88fe
generated_at: 2026-11-14T20:29:45.453347+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/stream.ts

## Purpose

Implements the server side of a one-way Server-Sent Events (SSE) stream that pushes live process and HTTP metrics to a dashboard every 5 seconds. SSE was chosen over WebSockets because the data flow is strictly server→client, it rides plain HTTP (no protocol upgrade), and browsers reconnect automatically via `EventSource`.

## Key elements

- **`sseClients`** (module-level `Set<Response>`) — tracks active SSE connections per process; enables O(1) removal on disconnect and exposes the count in the metrics payload itself.
- **`UPDATE_INTERVAL_MS`** (5 000) / **`HEARTBEAT_INTERVAL_MS`** (15 000) — push cadence for data frames and keep-alive frames respectively.
- **`writeEvent(response, event, payload)`** — serialises a single SSE frame (`event:` + `data:` + `\n\n`) onto the response stream.
- **`buildObservabilityPayload()`** *(exported)* — assembles one `ObservabilityMetricsPayload` by merging `processSnapshot()` (memory, uptime) with async HTTP counters; returns a `Promise`.
- **`writeMetricsEvent(response, eventName)`** — fire-and-forget wrapper around `buildObservabilityPayload` → `writeEvent`; swallows all errors so a dropped socket or slow read never crashes the interval.
- **`streamObservabilityMetrics(response, userId, reverify)`** *(exported)* — public entry point: opens the SSE stream via `openSseStream`, sends an immediate `SNAPSHOT` frame, schedules `UPDATED` and `HEARTBEAT` intervals, and wires `onClose` to clear both intervals and remove the response from `sseClients`.

## Relationships

- **`src/infrastructure/http/sse.ts`** — provides `openSseStream`, which sets SSE headers, enforces the per-account stream cap, and polls the `reverify` callback for ongoing authorization. Returns `null` if the cap is hit (stream aborts early).
- **`src/modules/observability/http-readback.ts`** — source of cumulative `totalRequests` / `totalErrors` counters merged into every payload.
- **`src/modules/observability/services/process-snapshot.ts`** — source of `uptimeSeconds` and the four memory fields in each payload.
- **`src/types/index.ts`** — defines `OBSERVABILITY_CHANNELS` (channel-name constants), `ObservabilityMetricsPayload`, and `ObservabilityChannel`.
- **`src/modules/observability/services/index.ts`** — re-exports the public API of this module.
- **`src/modules/observability/tests/unit/stream.test.ts`** — unit tests covering this file's behaviour.

## Notes

- **Per-process, not cluster-wide.** Under `cluster` each worker tracks only its own `sseClients`; there is no cross-worker aggregation.
- **Self-referential leak canary.** `realtime.sseClients` is the live size of the in-memory `Set`. A connection that is added but never removed will show as a steadily climbing number on the very dashboard that connection feeds.
- **Trailing `\n\n` is mandatory.** The SSE spec requires it to delimit a frame; omitting it causes the client to buffer indefinitely. `writeEvent` always appends it.
- **`void` on the promise in `writeMetricsEvent`** is deliberate: the interval must not `await` the write, and the `void` keyword documents that the floating promise is intentional (avoids `no-floating-promises` lint noise while still surfacing it to readers).
- **Heartbeat carries a real payload**, not an SSE comment (`: ping`). This lets the client treat a missing heartbeat as a liveness failure without needing a separate ping/pong mechanism.
- **`reverify` is an opaque `() => Promise<boolean>` callback**, not a direct auth call. The wiring lives in the route layer (e.g. `kernel/middlewares/authorizations.ts#stillHoldsRuleViaCookie`), keeping this module agnostic of the authentication mechanism.
- **Initial `SNAPSHOT` vs periodic `UPDATED`.** The first frame uses a distinct channel so the client can treat it as "initial state" rather than a delta, avoiding a 5-second blank dashboard.
