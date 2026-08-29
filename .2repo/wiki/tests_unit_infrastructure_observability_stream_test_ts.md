# tests/unit/infrastructure/observability/stream.test.ts

## Purpose

Unit tests for the SSE observability metrics stream. The suite exists because three failure modes in `stream.ts` are silent — wire-format whitespace, uncleared timers on disconnect, and unhandled rejections inside interval callbacks — and none of them produce an error visible to the developer. The tests pin the exact bytes written to the socket, the timer lifecycle, and the error-absorption contract.

## Key elements

- **`makeResponse()`** — hand-built fake Express `Response` (via `asStub`) that records every `write` call into a `frames` array and exposes a `disconnect()` method to fire the registered `close` handler on demand.
- **`parseFrame(frame)`** — splits a raw SSE frame string into `{ event, payload, terminator }`, asserting the `event:`/`data:` line structure and the `'\n\n'` terminator.
- **`open()`** — test helper that calls `streamObservabilityMetrics` with a fresh fake response, tracks it in `opened[]` so `afterEach` can disconnect every client.
- **`buildObservabilityPayload` tests** — verify the combined payload shape (memory, http counters, sseClient count, ISO-8601 timestamp, floored uptime).
- **`getActiveSseClients` tests** — verify the module-level `Set` increments on open and decrements on disconnect.
- **"opening a stream" tests** — assert 200 status, the three SSE headers, `flushHeaders` call, immediate snapshot frame, correct `event:`/`data:` lines, single-line JSON payload, and the `'\n\n'` frame terminator.
- **"the two timers" tests** — advance fake timers to confirm a 5 s update interval and a 15 s heartbeat interval fire independently and only after their interval elapses.
- **"teardown" tests** — assert both intervals stop on disconnect (no further writes) and that one client's disconnect does not affect another's stream.
- **"failures that must not escape" tests** — mock a rejected `getHttpRequestCounters` and a post-disconnect `write` to confirm no unhandled rejection escapes the interval callback.
- **Mock of `getHttpRequestCounters`** — jest-mocked at the module level; deterministic `{ totalRequests: 10, totalErrors: 2 }` by default.

## Relationships

- **`src/infrastructure/observability/stream.ts`** — the module under test. The file imports `buildObservabilityPayload`, `getActiveSseClients`, and `streamObservabilityMetrics`, and mocks its internal dependency on `getHttpRequestCounters` from `@infrastructure/observability/metrics-http`.
- **`tests/support/stub.ts`** — provides `asStub<T>`, a utility for constructing typed partial mocks (used here to build the fake `Response` without pulling in a real Express socket).

## Notes

- **Fake timers are mandatory.** Every `beforeEach` switches to `jest.useFakeTimers()`; the real intervals (5 s, 15 s) would otherwise make tests slow and flaky. `afterEach` restores real timers.
- **Module-level `Set` state.** The `opened[]` array and the `afterEach` disconnect loop exist because `stream.ts` tracks clients in a module-scoped `Set`. Failing to disconnect leaks both timers and the `Set` entry into subsequent tests.
- **Uptime is floored, not rounded.** The test explicitly asserts `12.7 → 12` and references the shared reader in `infrastructure/observability/process-snapshot.ts` as the reason the convention is floor.
- **SSE frame termination is `'\n\n'`.** The tests treat the blank line as a first-class assertion because dropping it causes clients to buffer indefinitely while the server appears healthy.
- **`parseFrame` is test-local.** It is not exported or shared; it exists only to decompose the exact bytes the module writes.
