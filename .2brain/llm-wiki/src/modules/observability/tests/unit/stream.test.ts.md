---
source: src/modules/observability/tests/unit/stream.test.ts
sha256: d7ae6e7981527f9d53090fc72a8e7868be283cee979cb8b0684e5d8dd65508f4
generated_at: 2026-11-08T06:44:38.393432+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/stream.test.ts

## Purpose

Unit-test suite for the SSE metrics stream (`streamObservabilityMetrics`) and its payload builder (`buildObservabilityPayload`). It verifies the wire format, connection bookkeeping, timer cadence, permission-recheck lifecycle, and error absorption of the stream module using fake timers and a hand-built response stub, so no real socket or clock is involved.

## Key elements

- **`makeResponse()`** — builds a `FakeResponse` that records every `write` call in `frames`, captures headers, and exposes a `disconnect()` method that fires registered `close` handlers. Hand-built (not a real Express `Response`) so the test can read exact bytes and trigger teardown deterministically.
- **`parseFrame(frame)`** — splits a single SSE frame into `{ event, payload, terminator }` so tests can assert on the event name, JSON body, and the blank-line boundary.
- **`reportedClients()`** — reads `payload.realtime.sseClients` from `buildObservabilityPayload()`, the only public surface that exposes the open-connection count.
- **`open(reverify?)`** — convenience helper that calls `streamObservabilityMetrics` with a `FakeResponse` and tracks it in `opened` for cleanup in `afterEach`.
- **Mocked `getHttpRequestCounters`** — `jest.mock('../../http-readback', …)` replaces the counters reader with a stable `jest.fn`, making payload contents deterministic.
- **Test groups** — `buildObservabilityPayload`, open-connection count, opening a stream (headers, flush, first snapshot, wire format), the two timers (update / heartbeat), and the permission recheck (cadence, failure → `end`, timer cleanup).

## Relationships

- **`src/modules/observability/services/stream.ts`** — the module under test. The file imports `buildObservabilityPayload` and `streamObservabilityMetrics` and asserts on their observable side-effects (frames written, headers set, timers scheduled, `end` called).
- **`tests/support/stub.ts`** — provides `asStub<Response>(…)` which lets the fake response object be typed as Express `Response` without extending the interface; used in `makeResponse`.
- **`src/kernel/registry.ts`** — appears as a graph neighbor (likely a transitive dependency through the stream service); no direct import in this test file.

## Notes

- **Fake timers are mandatory.** Every test that touches scheduling uses `jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync`; the intervals (5 s update, 15 s heartbeat, 30 s recheck) are asserted by exact tick counts, not wall-clock.
- **`opened` / `afterEach` disconnect pattern.** The module keeps a module-level `Set` of open responses. `afterEach` disconnects every fake opened by the current test so that set is empty before the next test; forgetting this causes cross-test contamination of the client count.
- **Wire-format assertion is load-bearing.** The tests explicitly check that each frame ends with `\n\n` and that the `data:` line contains no embedded newline. The file's header comment explains that omitting the trailing blank line causes silent client-side buffering with no server-side error.
- **`asStub` is a type-level escape hatch.** It casts the hand-built object to `Response` so TypeScript accepts it where the production function expects a real Express response, without requiring `Response` to be `any`.
- **Reverify-failure tests assert `end` directly**, not by inferring it from a subsequent missing timer tick. The truncated test ("stops every timer once a recheck fails") also verifies no further frames are written after `end` is called.
