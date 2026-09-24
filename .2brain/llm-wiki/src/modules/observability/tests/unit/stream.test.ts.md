---
source: src/modules/observability/tests/unit/stream.test.ts
sha256: 5864cf72a7cc5b7bb2e0ebd2f096705ef99da97a51cf8c9ae1ad3c10612250e4
generated_at: 2026-09-23T18:59:22.689484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/stream.test.ts

## Purpose

Unit test suite for the SSE metrics stream service (`streamObservabilityMetrics` and `buildObservabilityPayload`). It verifies wire-format correctness, timer cadence, connection lifecycle (open/disconnect counting), permission recheck behavior, and error containment — the three categories of silent failure the service is designed to prevent. All timing is driven by `jest.useFakeTimers` and `getHttpRequestCounters` is mocked, so every frame is deterministic.

## Key elements

- **`makeResponse()`** — hand-built `FakeResponse` object exposing `status`, `flushHeaders`, `write` (records frames), `setHeader` (records headers), `on` (captures the `close` handler), `end`, and a `disconnect()` helper that fires the stored close handler. Replaces a real Express `Response` so tests can inspect exact bytes and simulate disconnects on demand.
- **`parseFrame(frame)`** — splits a raw SSE frame string into `{ event, payload, terminator }` using the `event: `/`data: `/`\n\n` contract. Used to assert structural correctness of every written frame.
- **`reportedClients()`** — convenience that calls `buildObservabilityPayload()` and extracts `payload.realtime.sseClients`, letting tests assert the module-level connection count without reaching into internal state.
- **`describe('buildObservabilityPayload')`** — asserts payload shape (memory, http counters, connection count), ISO-8601 timestamp, and uptime floor-to-whole-seconds.
- **`describe('the open-connection count')`** — verifies the Set grows per open stream and shrinks on disconnect.
- **`describe('opening a stream')`** — checks 200 status, SSE headers, immediate `flushHeaders`, initial snapshot frame, correct `\n\n` termination, and single-line `data:` payload.
- **`describe('the two timers')`** — confirms the 5 s update interval and the independent 15 s heartbeat interval fire at the right cadence (and not before).
- **`describe('the permission recheck')`** — verifies the 30 s reverify cadence, that a failed recheck calls `end` once and stops _all_ timers, not just the recheck interval.
- **`afterEach`** — disconnects every opened stream and resets fake timers, ensuring the module-level connection Set is empty between tests.

## Relationships

- **`src/modules/observability/services/stream.ts`** — the module under test. The file imports `buildObservabilityPayload` and `streamObservabilityMetrics` and exercises their full contract (SSE framing, timers, connection registry, reverify callback).
- **`tests/support/stub.ts`** — provides `asStub`, used to cast the hand-built fake response object to the `Response` type so it can be passed to `streamObservabilityMetrics` without TypeScript complaints.
- **`src/kernel/registry.ts`** — listed as a graph neighbor; the test file does not import it directly, but `streamObservabilityMetrics` internally relies on the registry for permission rechecks (the `reverify` callback parameter), which the tests exercise indirectly.

## Notes

- The module-level connection Set is _not_ reset by the SUT on test teardown; the suite handles this by disconnecting every opened stream in `afterEach`. Forgetting this leaks count between tests.
- `getHttpRequestCounters` is mocked via `jest.mock('../../http-readback', …)` with a `jest.fn` defined _outside_ the factory to avoid the "out-of-scope variable" restriction.
- The SSE terminator assertion (`endsWith('\n\n')` and `terminator` deep-equal to `['', '']`) is the single most important wire-format check: without the blank line, every downstream SSE client buffers forever.
- The uptime test documents an intentional design choice: floor (not round) to whole seconds, shared with `modules/observability/services/process-snapshot.ts`, so that concurrent dashboard endpoints never report uptimes a second apart.
- The file was truncated in the provided content; the last visible test (`'stops every timer once a recheck fails, not just the recheck itself'`) is cut mid-assertion. The full suite likely also covers the error-absorption cases (rejected metrics read, write to closed socket) described in the header comment.
