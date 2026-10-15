---
source: src/modules/observability/services/stream.ts
sha256: 844d9846048390de36e16f10a2514ca9c1c7e9b499a821422f2d2791ace49557
generated_at: 2026-10-15T10:56:36.220808+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/stream.ts

## Purpose

Provides a live metrics feed over Server-Sent Events (SSE) for an admin dashboard. It manages the set of connected SSE clients, builds periodic metric snapshots, and handles stream lifecycle (headers, heartbeat, permission re-verification, teardown). SSE was chosen over WebSockets because the data flows one direction, it is plain HTTP, and browsers reconnect automatically via `EventSource`.

## Key elements

- **`sseClients`** — module-level `Set<Response>` tracking one entry per connected SSE client. Per-process (not shared under clustering). Also exposed as `realtime.sseClients` in the payload, making a leak self-evident on the dashboard.
- **`UPDATE_INTERVAL_MS` / `HEARTBEAT_INTERVAL_MS` / `REVERIFY_INTERVAL_MS`** — timing constants (5 s, 15 s, 30 s) governing data push, keep-alive ping, and permission recheck cadence.
- **`writeEvent(response, event, payload)`** — writes a single SSE frame (`event:` / `data:` / blank-line terminator) to the response stream.
- **`buildObservabilityPayload()`** *(exported)* — merges `processSnapshot()` (memory, uptime) with `getHttpRequestCounters()` (cumulative request/error totals) and `sseClients.size` into a single `ObservabilityMetricsPayload` matching the asyncapi.yaml schema.
- **`writeMetricsEvent(response, channel)`** — fire-and-forget wrapper around `buildObservabilityPayload` → `writeEvent`; swallows all errors so a dead socket or slow read never tears down the stream or crashes the process.
- **`streamObservabilityMetrics(response, reverify)`** *(exported)* — sets SSE headers, flushes them, registers the response in `sseClients`, sends an immediate `METRICS_SNAPSHOT` frame, then schedules the three intervals (data push, heartbeat, permission recheck). Wires `response.on('close')` to clear all intervals and remove the client from the set.

## Relationships

- **`src/types/index.ts`** — imports `OBSERVABILITY_CHANNELS`, `ObservabilityMetricsPayload`, and `ObservabilityChannel`; the channel names are contractual with `asyncapi.yaml`.
- **`../http-readback.ts`** — calls `getHttpRequestCounters()` inside `buildObservabilityPayload` to include cumulative HTTP request/error totals.
- **`./process-snapshot.ts`** — calls `processSnapshot()` to obtain Node.js memory and uptime figures.
- **`./index.ts`** — barrel file; re-exports `buildObservabilityPayload` and `streamObservabilityMetrics` for consumers outside the observability module.
- **`controllers/get-observability-events.ts`** — the Express route handler that invokes `streamObservabilityMetrics` and supplies the `reverify` callback (wired to `stillHoldsKeyViaCookie`).
- **`tests/unit/stream.test.ts`** — unit tests for this module's exports.
- **`tests/unit/get-observability-events.test.ts`** — integration-level tests that exercise the controller path into this stream.

## Notes

- **Auth-agnostic by design.** `streamObservabilityMetrics` accepts a plain `() => Promise<boolean>` callback rather than a specific auth function, keeping this module free of middleware concerns. The controller decides what "reverify" means.
- **`void` + `.catch(() => undefined)`** in `writeMetricsEvent` is deliberate: an unhandled rejection inside a `setInterval` callback would crash the process.
- **`flushHeaders()` is explicit.** Without it, Express would buffer headers until the first body write, making the request appear unanswered to the client.
- **`response.on('close')` is the only teardown hook.** The response never "finish"es (it is intentionally never completed), so `'close'` covers tab-close, navigation, network drop, and proxy timeout alike.
- **First frame uses `METRICS_SNAPSHOT`**, subsequent frames use `METRICS_UPDATED`. The client distinguishes initial state from deltas based on the channel name.
- **HTTP counters are cumulative since boot**; the *client* derives rates by differencing consecutive frames. Nothing here is pre-rounded.
- **Under clustering**, each worker process maintains its own `sseClients` set; there is no cross-worker coordination.
