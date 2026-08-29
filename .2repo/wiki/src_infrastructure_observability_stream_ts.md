# src/infrastructure/observability/stream.ts

## Purpose

Implements a Server-Sent Events (SSE) endpoint that pushes live process and HTTP metrics to connected dashboard clients every 5 s, with a 15 s heartbeat to survive proxy idle timeouts. SSE was chosen over WebSockets because the data is strictly one-way, requires no protocol upgrade, and browsers reconnect automatically via `EventSource`.

## Key elements

- **`sseClients`** (module-level `Set<Response>`) — tracks every active SSE connection in this worker process; used for leak detection and O(1) cleanup.
- **`UPDATE_INTERVAL_MS` / `HEARTBEAT_INTERVAL_MS`** — 5 000 ms and 15 000 ms push/heartbeat cadences.
- **`writeEvent(response, event, payload)`** — internal helper that writes a single SSE frame (`event:` / `data:` / blank-line terminator).
- **`getActiveSseClients()`** — exported; returns `sseClients.size` so the dashboard can surface its own connection count (self-referential leak detector).
- **`buildObservabilityPayload()`** — exported async function; merges `processSnapshot()` with `getHttpRequestCounters()` into a single `ObservabilityMetricsPayload` matching the asyncapi.yaml schema. All numeric fields are raw cumulative values (client computes rates).
- **`writeMetricsEvent(response, eventName)`** — internal fire-and-forget wrapper; swallows all rejections so a dead socket or slow metrics read never crashes the interval loop.
- **`streamObservabilityMetrics(response)`** — exported entry point; sets SSE headers (`text/event-stream`, `no-cache no-transform`, `keep-alive`), flushes headers immediately, registers the client, sends an initial `METRICS_SNAPSHOT` frame, then schedules the update and heartbeat intervals. Tears down both intervals and removes the client from `sseClients` on the `close` event.

## Relationships

- **`@infrastructure/observability/metrics-http`** — calls `getHttpRequestCounters()` to read cumulative request/error totals for each payload frame.
- **`@infrastructure/observability/process-snapshot`** — calls `processSnapshot()` for Node.js memory, uptime, and other runtime stats.
- **`@types`** — imports `OBSERVABILITY_CHANNELS` (channel-name constants shared with `asyncapi.yaml`), `ObservabilityMetricsPayload`, and `ObservabilityChannel`.
- **`src/modules/observability/routes.ts`** — the Express route handler that invokes `streamObservabilityMetrics(response)` to open the SSE stream.
- **`tests/unit/infrastructure/observability/stream.test.ts`** — unit tests covering the exported functions and stream lifecycle.

## Notes

- **Per-process scope:** Under `cluster` each worker maintains its own `sseClients` set and its own intervals; there is no cross-worker coordination.
- **Teardown is on `'close'`, not `'finish'`:** An SSE response never "finishes" normally, so `'close'` is the only reliable disconnect signal. Missing it leaks both the intervals and the `Response` object.
- **All writes are fire-and-forget:** `writeMetricsEvent` intentionally swallows rejections. An unhandled rejection inside a `setInterval` callback would crash the process.
- **Channel names are contractual:** They come from `OBSERVABILITY_CHANNELS` in `@types` and must stay in sync with `asyncapi.yaml`; do not hard-code string literals.
- **Payloads are raw, not pre-formatted:** Memory values are in bytes, HTTP counters are cumulative-since-boot. The dashboard is responsible for differencing consecutive frames to derive rates.
- **SSE wire format is whitespace-significant:** The trailing `\n\n` in `writeEvent` is the frame delimiter; omitting it causes the client to buffer indefinitely.
