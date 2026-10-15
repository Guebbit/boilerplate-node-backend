---
source: src/modules/observability/tests/unit/stream.test.ts
sha256: d7ae6e7981527f9d53090fc72a8e7868be283cee979cb8b0684e5d8dd65508f4
generated_at: 2026-10-15T10:58:30.550350+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/stream.test.ts

## Purpose

Unit test suite for the SSE (Server-Sent Events) metrics stream. It verifies three things that fail silently if broken: the exact wire format of each SSE frame, timer teardown on disconnect (preventing zombie intervals and memory leaks), and error absorption inside interval callbacks. Uses fake timers and a hand-built fake `Response` so frames are deterministic and inspectable byte-for-byte.

## Key elements

- **`makeResponse()`** — Builds a minimal fake Express `Response` (via `asStub`) that records every `write()` call into a `frames` array, captures `setHeader` values, and exposes a `disconnect()` method that fires all registered `close` handlers.
- **`parseFrame(frame)`** — Splits a written SSE frame back into `{ event, payload, terminator }`, asserting the `event: `/`data: ` prefixes and the double-newline terminator.
- **`reportedClients()`** — Thin wrapper around `buildObservabilityPayload()` to read `realtime.sseClients` without coupling tests to the full payload shape.
- **`open(reverify?)`** — Convenience helper that calls `streamObservabilityMetrics` with a fake response and an optional recheck callback; tracks all opened streams in `opened[]` so `afterEach` can disconnect them.
- **Constants** — `UPDATE_INTERVAL_MS` (5 000), `HEARTBEAT_INTERVAL_MS` (15 000), `REVERIFY_INTERVAL_MS` (30 000) mirror the module's internal timers for assertion.
- **Test groups** — `buildObservabilityPayload` (shape, timestamp, uptime flooring), `the open-connection count` (increment/decrement on open/disconnect), `opening a stream` (status, headers, immediate snapshot, SSE frame format, single-line data), `the two timers` (update cadence, no early push, independent heartbeat), `the permission recheck` (cadence, stream end on failure, all-timer stop).

## Relationships

- **`src/modules/observability/services/stream.ts`** — The module under test. The suite imports `buildObservabilityPayload` and `streamObservabilityMetrics` and drives them through the fake response.
- **`tests/support/stub.ts`** — Provides `asStub<T>()`, used inside `makeResponse` to create a typed proxy around the hand-built mock methods.
- **`../../http-readback`** (i.e. `src/modules/observability/services/http-readback.ts`) — Mocked via `jest.mock`; `getHttpRequestCounters` is replaced with a `jest.fn` returning fixed counters so frame contents are deterministic.

## Notes

- The `afterEach` loop calls `fake.disconnect()` on every opened stream before restoring real timers. Forgetting this would leave the module-level `Set` populated and leak intervals into the next test.
- The `terminator` assertion (`['', '']` after splitting on `\n`) is the mechanism that pins the SSE blank-line requirement; a single trailing `\n` would produce `['']` and the test would fail.
- Uptime is asserted as `12` from a mocked `12.7`, encoding a *floor* (not round) convention shared with other observability payloads via `process-snapshot.ts`.
- The `reverify` parameter to `open()` defaults to an always-passing check; tests that need a failure inject their own `() => Promise.resolve(false)` closure.
- The file docblock explicitly calls out that *reachability without assertion is not validation* — every test asserts observable output (frames, headers, call counts) rather than merely executing the code path.
