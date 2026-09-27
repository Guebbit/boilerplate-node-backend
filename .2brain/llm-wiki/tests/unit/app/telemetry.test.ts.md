---
source: tests/unit/app/telemetry.test.ts
sha256: d931ea2bb04f3cdab1c363afa5f1afa8325c0ce8a06bfbda5a95a9926456b142
generated_at: 2026-09-27T16:02:13.531436+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/telemetry.test.ts

## Purpose

Verifies that `installTelemetry`'s in-flight request gauge is decremented when a client aborts a request (fires `close` without ever firing `finish`). This covers the "walked-away" case that the gauge must handle, preventing a slow leak in the metric.

## Key elements

- **`telemetryMiddleware()`** — Calls `installTelemetry` with a stubbed Express app whose `use` is a jest mock, then extracts the mounted `RequestHandler` from the first `use` call.
- **`inflight()`** — Async helper that reads the current value of the `httpInflightRequests` gauge (via `.get()`), defaulting to `0` if absent.
- **`describe('installTelemetry')` / single `it`** — Asserts the gauge increments by 1 on request start, then decrements back to baseline after `response.emit('close')`.

## Relationships

- **`src/app/telemetry.ts`** — Module under test; provides `installTelemetry` which mounts the middleware.
- **`src/infrastructure/observability/metrics-http.ts`** — Provides the `httpInflightRequests` gauge that the assertions read.
- **`tests/support/stub.ts`** — Provides `asStub<T>()` to create minimally-typed stand-ins for `Express`, `Request`, and `Response` without pulling in real Express instances.

## Notes

- The test uses `EventEmitter` (not `EventTarget`) to simulate the Express `Response` because the middleware calls `.once()`, which `EventTarget` does not expose. An eslint-disable for `unicorn/prefer-event-target` documents this.
- Only the `close`-without-`finish` path is tested here; the normal `finish` path is presumably covered elsewhere or by the implementation's own symmetry.
- The gauge is read asynchronously (`await … .get()`), so both `before` and post-mutation values are `Promise<number>`.
