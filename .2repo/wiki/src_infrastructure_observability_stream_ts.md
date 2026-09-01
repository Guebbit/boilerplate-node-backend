# src/infrastructure/observability/stream.ts

## Purpose

Implements a Server-Sent Events (SSE) stream that pushes live observability metrics (memory, HTTP counters, connection counts) from the server to a dashboard every 5 seconds. It chooses SSE over WebSockets because the data is strictly one-way, requires no protocol upgrade or extra dependency, and gets free auto-reconnect from the browser's built-in `EventSource`.

## Key elements

- **`streamObservabilityMetrics(response)`** — exported entry point. Sets SSE headers, flushes them immediately, sends an initial `METRICS_SNAPSHOT` frame, then schedules a 5 s update interval and a 15 s heartbeat interval. Registers a `close` listener that clears both intervals and removes the response from the client set.
- **`buildObservabilityPayload()`** — exported. Assembles a single `ObservabilityMetricsPayload` by merging `processSnapshot()` (sync) with `getHttpRequestCounters()` (async). Returns a timestamped object matching the asyncapi.yaml schema.
- **`getActiveSseClients()`** — exported. Returns `sseClients.size`; used inside the payload so a connection leak is visible on the dashboard that feeds on it.
- **`writeEvent(response, event, payload)`** — internal. Writes one SSE frame in the strict `event:`/`data:`/`\n\n` wire format.
- **`writeMetricsEvent(response, eventName)`** — internal. Fire-and-forget wrapper around `buildObservabilityPayload` + `writeEvent`; all errors are silently swallowed so a bad read or a dead socket never crashes the interval.
- **`sseClients`** — module-level `Set<Response>` tracking connected clients. Per-process (not shared across cluster workers).

## Relationships

- **`src/types/index.ts`** — imports the `OBSERVABILITY_CHANNELS` constants and the `ObservabilityMetricsPayload` / `ObservabilityChannel` types that define the on-the-wire contract.
- **`src/infrastructure/observability/metrics-http.ts`** — imports `getHttpRequestCounters` to fill the `http` section of each payload.
- **`src/infrastructure/observability/process-snapshot.ts`** — imports `processSnapshot` for uptime and V8/Node memory fields.
- **`src/modules/observability/routes.ts`** — the Express route handler that calls `streamObservabilityMetrics` to open the SSE endpoint.
- **`tests/unit/infrastructure/observability/stream.test.ts`** — unit tests for the stream module itself.
- **`src/modules/observability/tests/unit/routes.test.ts`** — integration-level tests exercising the SSE route (and thus this file) through the router.

## Notes

- The response never calls `res.end()`; teardown is driven exclusively by the `'close'` event (a `'finish'` handler would never fire).
- `void` is placed before the floating promise in `writeMetricsEvent` to signal to lint tooling that the un-awaited Promise is intentional.
- The heartbeat frame carries a real payload (not an SSE comment line) so the dashboard can double it as a liveness/staleness signal.
- All metrics in a single frame are cumulative-since-boot; the client is expected to difference consecutive frames to derive rates.
- Under a cluster (multiple workers), each process tracks only its own `sseClients`; there is no cross-worker aggregation here.
