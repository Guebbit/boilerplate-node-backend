---
source: src/modules/observability/services/stream.ts
source_sha256: ee9478909ca87b4dea2ed5fa4bcb03738c15c5e30c81e6494283bce3479dd3e9
context_sha256: 80a86ff3ee8d15c88088bc638928b1f7d2e37f6c583cd947e942439dec8a4499
generated_at: 2026-11-22T06:03:58.624928+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/services/stream.ts

## Purpose
Streams live process and HTTP metrics to dashboards over Server-Sent Events (SSE). SSE was chosen over WebSockets because the data flows one way (server to dashboard) over plain HTTP, needs no protocol upgrade or extra dependency, and the browser's `EventSource` reconnects automatically.

## Key elements
- `buildObservabilityPayload()` (exported): returns a `Promise<ObservabilityMetricsPayload>` for one frame. The payload contains:
  - an ISO timestamp;
  - `uptimeSeconds` and `memory` (in bytes) from `processSnapshot()`;
  - `http.totalRequests` and `http.totalErrors` from `getHttpRequestCounters()`;
  - `realtime.sseClients`, the current client count.
- `streamObservabilityMetrics(response, userId, reverify)` (exported): opens the stream via `openSseStream`. It returns silently if `openSseStream` returns a falsy value, meaning a cap refused the open and already answered. Otherwise it:
  - registers the response in `sseClients`;
  - immediately sends a `METRICS_SNAPSHOT` event;
  - sends `METRICS_UPDATED` every 5 s (`UPDATE_INTERVAL_MS`);
  - sends `HEARTBEAT` every 15 s (`HEARTBEAT_INTERVAL_MS`);
  - on `stream.onClose`, clears both intervals and removes the response from `sseClients`.
- `writeEvent`: writes one SSE frame as `event: <channel>\ndata: <json>\n\n`. The trailing blank line is required, or the client buffers indefinitely.
- `writeMetricsEvent`: fire-and-forget wrapper that builds a payload and writes it. It swallows errors from a failed metrics read or a write to an already-dropped socket, so an interval callback never causes an unhandled rejection.
- `sseClients` (module-private `Set<Response>`): the active connections. It is per-process, so with several copies each tracks only its own clients.

## Relationships
- `src/infrastructure/http/sse.ts`: `openSseStream` handles headers, the per-account stream cap, re-verification via the `reverify` callback, and the `onClose` hook.
- `src/modules/observability/http-readback.ts`: supplies `getHttpRequestCounters()`, whose counters are cumulative since boot.
- `src/modules/observability/services/process-snapshot.ts`: supplies `processSnapshot()` for uptime and memory.
- `src/types/index.ts`: provides `OBSERVABILITY_CHANNELS`, `ObservabilityChannel` and `ObservabilityMetricsPayload`. The channel names are shared with an AsyncAPI spec, so event names are contractual.
- `src/modules/observability/services/index.ts`: a graph neighbor; this file's content shows no direct interaction with it.
- `src/modules/observability/tests/unit/stream.test.ts` and `tests/integration/kernel/outbox.test.ts`: test neighbors. The file content shows no direct interaction with the outbox.

## Notes
- The snapshot is read synchronously before the async counter read, so all values in a frame describe roughly the same instant.
- Counters are cumulative and memory values are raw bytes. Clients derive rates by differencing consecutive frames.
- The heartbeat carries a real metrics payload rather than an SSE comment, so clients can use it as a liveness signal. 15 s stays under typical proxy idle timeouts of 30–60 s.
- `realtime.sseClients` is self-referential on purpose. A leak in `sseClients` appears as a climbing number on the dashboard it feeds.
- `reverify` is a plain callback so this module stays independent of how callers authenticate. The route wires it to `src/kernel/middlewares/authorizations.ts#stillHoldsRuleViaCookie`.
- Cleanup in `onClose` is essential. Uncleared intervals would keep writing to a dead socket, and a leftover `Set` entry would pin the `Response` in memory.
