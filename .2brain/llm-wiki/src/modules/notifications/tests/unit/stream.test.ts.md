---
source: src/modules/notifications/tests/unit/stream.test.ts
sha256: 374f9e581396632610a08394cf5b3c75b9e03e8185e94fa47ae9df91b0559b21
generated_at: 2026-10-15T10:53:47.740780+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/stream.test.ts

## Purpose

Unit tests for the per-user SSE notification hub (`streamNotifications` and `publishToUser`). They verify the three failure modes that are invisible from inside the module: the SSE wire format (correct headers, `event:`/`data:`/blank-line framing), per-user routing (a frame reaches only that user's sockets), and teardown (timers and map entries are cleaned up on disconnect and on permission revocation).

## Key elements

- **`makeResponse()`** — builds a minimal fake Express `Response` whose `write`, `status`, `flushHeaders`, `setHeader`, and `on('close')` calls are captured; returns a `FakeResponse` with a `frames[]` array and a `disconnect()` helper that fires all registered close handlers.
- **`FakeResponse`** (interface) — the contract for the fake: `response`, `frames`, `headers`, mocked `end`/`write`/`status`/`flushHeaders`, and `disconnect()`.
- **`open(userId, reverify?)`** — test-local helper; creates a fake, calls `streamNotifications`, records the fake, and returns it. Defaults `reverify` to always-true.
- **`HEARTBEAT_INTERVAL_MS` / `REVERIFY_INTERVAL_MS`** — constants (15 000 / 30 000 ms) used to advance fake timers to the right moments.
- **Test groups:** headers & status → frame format → per-user routing → no-op publish → write-error swallowing → keep-alive comment → teardown (forget stream, multi-tab) → permission recheck (still holds, no longer holds, throws → fails closed).

## Relationships

- **`src/modules/notifications/services/stream.ts`** — the module under test. This file imports `streamNotifications` (the handler), `publishToUser` (the fan-out call), and `openStreamCount` (an observable for asserting leak-free teardown).
- **`tests/support/stub.ts`** — provides `asStub<T>()`, used by `makeResponse()` to produce a type-safe partial mock of the Express `Response` without pulling in the real Express types.

## Notes

- All opened fakes are disconnected in `afterEach`; forgetting this would let timers from one test fire during the next.
- The keep-alive test asserts the frame is `: keep-alive\n\n` — an SSE *comment*, not an `event:` line. Changing it to a named event would break every client that doesn't handle it.
- The "fails closed" recheck test (`reverify` rejects) is intentional: a transient DB error must end the stream rather than silently keeping it open.
- `jest.useFakeTimers()` is set in `beforeEach` and `jest.useRealTimers()` in `afterEach`; any new test that opens a stream inherits this and must not call `jest.useRealTimers()` itself.
- `openStreamCount()` is the only external way to assert that map entries were removed; it is not a production API but a test seam in the service module.
