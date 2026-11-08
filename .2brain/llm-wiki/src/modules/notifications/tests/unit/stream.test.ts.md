---
source: src/modules/notifications/tests/unit/stream.test.ts
sha256: 374f9e581396632610a08394cf5b3c75b9e03e8185e94fa47ae9df91b0559b21
generated_at: 2026-11-08T06:37:33.614226+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/stream.test.ts

## Purpose

Unit tests for the per-user Server-Sent Events (SSE) notification hub. They verify the wire format, per-user routing, heartbeat behavior, teardown hygiene, and the periodic permission recheck—all by driving `streamNotifications` with a hand-built fake `Response` and fake timers so the exact bytes written to the socket are assertable.

## Key elements

- **`FakeResponse`** – interface describing the fake Express response and its introspection surface (`frames`, `headers`, `disconnect`).
- **`makeResponse()`** – builds a `Response` stub (via `asStub`) whose `write` captures SSE frames and whose `on('close')` handler is collectable for later disconnect simulation.
- **`open(userId, reverify?)`** – test helper that calls `streamNotifications` with the fake response and pushes the result into the shared `opened` array.
- **`beforeEach` / `afterEach`** – activate `jest.useFakeTimers()`, disconnect every opened fake on teardown, and restore real timers.
- **`describe('the notifications stream')`** suites:
  - *Headers* – asserts `Content-Type`, `Cache-Control`, `Connection`, and that 200 + `flushHeaders` precede any frame.
  - *Frame format* – asserts the exact `event:\ndata:\n\n` byte sequence.
  - *Routing* – confirms a `publishToUser` call reaches only that user's tabs.
  - *Heartbeat* – verifies the `: keep-alive\n\n` comment at `HEARTBEAT_INTERVAL_MS` (15 s).
  - *Teardown* – checks `openStreamCount` drops to 0, timers stop, and multi-tab users retain their entry while another tab is live.
  - *Permission recheck* – at `REVERIFY_INTERVAL_MS` (30 s) the stream stays open on `true`, ends on `false`, and ends on a thrown rejection (fail-closed).

## Relationships

- **`src/modules/notifications/services/stream.ts`** – the system under test. Imports `streamNotifications` (opens the SSE stream), `publishToUser` (pushes a frame to a user's open tabs), and `openStreamCount` (exposes the internal registry size for teardown assertions).
- **`tests/support/stub.ts`** – provides `asStub`, the generic helper that wraps partial objects in a casted `Response` so the test can supply only the methods the hub actually calls.

## Notes

- The fake response deliberately exposes `frames` as an ordered string array; tests compare full byte strings including the trailing `\n\n`, making a missing blank line immediately visible.
- `disconnect()` simulates the `'close'` event rather than calling `res.end`, so teardown logic in the hub (timer cleanup, map removal) is what's under test—not Express internals.
- The permission-recheck tests use `jest.advanceTimersByTimeAsync` (not the sync variant) because the recheck callback is async; mixing sync/async here is a common source of flakiness.
- `HEARTBEAT_INTERVAL_MS` and `REVERIFY_INTERVAL_MS` mirror the constants in the service; if the service changes them, the tests will silently test the wrong interval rather than fail—update both together.
