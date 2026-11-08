---
source: src/modules/observability/services/stream.ts
sha256: e6c55ef091ada168901e5f3d3b188e181da133b7be90530a76e66eed9f63b988
generated_at: 2026-11-08T06:41:43.729337+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/stream.ts

## Purpose

Serves live observability metrics to connected dashboards over Server-Sent Events. It opens an SSE stream per client, pushes a full metrics snapshot immediately, then periodically emits deltas (memory, HTTP counters, SSE client count) and heartbeats on separate timers, cleaning up all state on disconnect.

## Key elements

- **`sseClients`** (`Set<Response>`) — per-process registry of active SSE responses; `delete` is O(1) and prevents duplicate entries.
- **`UPDATE_INTERVAL_MS`** (5 000) — cadence for metric delta pushes.
- **`HEARTBEAT_INTERVAL_MS`** (15 000) — cadence for keep-alive frames; sits under common reverse-proxy idle timeouts (30–60 s).
- **`writeEvent`** — formats a single SSE frame (`event:` + `data:` + `\n\n`) and writes it to a response.
- **`buildObservabilityPayload`** *(exported)* — assembles an `ObservabilityMetricsPayload` by merging `processSnapshot()` (sync) with `getHttpRequestCounters()` (async) into one roughly-consistent frame.
- **`writeMetricsEvent`** — fire-and-forget wrapper around `buildObservabilityPayload` + `writeEvent`; swallows all errors so a single dead socket or failed read never crashes the process.
- **`streamObservabilityMetrics`** *(exported)* — public entry point: calls `openSseStream`, registers the response in `sseClients`, sends an immediate `METRICS_SNAPSHOT` frame, schedules `METRICS_UPDATED` and `HEARTBEAT` intervals, and tears down both intervals + the Set entry on close.

## Relationships

- **`@infrastructure/http/sse`** → imports `openSseStream`, which handles SSE response headers, the `reverify` permission re-check loop, and emits the `onClose` event this file hooks for cleanup.
- **`../http-readback`** → imports `getHttpRequestCounters` to source the `http.totalRequests` / `http.totalErrors` fields in each payload.
- **`./process-snapshot`** → imports `processSnapshot` for `uptimeSeconds` and the four `memory` byte counters.
- **`@types`** → imports `OBSERVABILITY_CHANNELS` (channel-name constants shared with `asyncapi.yaml`), and the `ObservabilityMetricsPayload` / `ObservabilityChannel` types that define the wire contract.
- **`./index.ts`** → barrel file that re-exports this module's public API.
- **`tests/unit/stream.test.ts`** → unit tests for this file.

## Notes

- **SSE, not WebSocket** — unidirectional, plain HTTP, and browsers' `EventSource` auto-reconnects for free; no protocol upgrade needed.
- **Two separate timers, not one** — the heartbeat (15 s) and data push (5 s) run independently. The heartbeat carries a real payload (not an SSE comment) so the client can also use it as a liveness signal.
- **Immediate first frame** — `METRICS_SNAPSHOT` is sent before the first interval fires; without it the dashboard would be blank for 5 s. The distinct channel name lets the client treat it as initial state.
- **Cumulative counters, client-side differencing** — `totalRequests` / `totalErrors` are cumulative since boot; the *client* computes rates by differencing consecutive frames. Nothing is rounded to megabytes for the same reason.
- **`sseClients.size` is self-monitoring** — a leak (responses added but never removed) shows up as a climbing number on the very dashboard the stream feeds.
- **`reverify` is a plain `() => Promise<boolean>`** — the route wires it to the authorization middleware; this module stays agnostic of the auth mechanism.
- **Fire-and-forget semantics** — `void` marks the floating promise as deliberate; an unhandled rejection inside a `setInterval` callback would crash the process.
- **Per-process state** — under clustering each worker tracks only its own SSE clients; there is no cross-worker aggregation.
