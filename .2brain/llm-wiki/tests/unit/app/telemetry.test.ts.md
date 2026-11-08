---
source: tests/unit/app/telemetry.test.ts
sha256: d931ea2bb04f3cdab1c363afa5f1afa8325c0ce8a06bfbda5a95a9926456b142
generated_at: 2026-11-08T10:03:16.036141+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/app/telemetry.test.ts

## Purpose

Unit test for `installTelemetry` that verifies the in-flight HTTP request gauge decrements correctly when a request's `close` event fires without a subsequent `finish` event (i.e., the client aborts or walks away mid-stream).

## Key elements

- **`telemetryMiddleware()`** — helper that calls `installTelemetry` with a stub Express app and returns the `RequestHandler` captured from the first `.use()` call.
- **`inflight()`** — async helper that reads the current value of the `httpInflightRequests` gauge via its `.get()` method.
- **`describe('installTelemetry')` / single `it`** — asserts the gauge increments by 1 after invoking the middleware, then returns to the baseline after emitting `close` on the response.

## Relationships

- **`src/app/telemetry.ts`** — the module under test; `installTelemetry` is called with a stubbed Express app to extract the middleware.
- **`src/infrastructure/observability/metrics-http.ts`** — provides `httpInflightRequests`, the gauge whose value the test reads to verify correct increment/decrement behavior.
- **`tests/support/stub.ts`** — `asStub` is used to create minimal typed stand-ins for `Request`, `Response`, and `Express` objects.

## Notes

- The response stub is an `EventEmitter` (not `EventTarget`) specifically because the middleware calls `.once()` on it; an eslint-disable comment documents this choice.
- The test does **not** emit `finish`; it relies solely on `close` firing to trigger the gauge decrement, which is the exact edge case the suite guards against.
- `inflight()` uses `values[0]?.value ?? 0`, so it tolerates the gauge being empty (value 0) before any requests have been recorded.
