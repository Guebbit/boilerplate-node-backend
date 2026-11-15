---
source: src/modules/notifications/tests/unit/stream.test.ts
sha256: 75c59c020111d289b507c53919759f47b12923e9da985c12236c4d1ed64ab746
generated_at: 2026-11-14T20:28:12.889333+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/stream.test.ts

## Purpose

Unit tests for the per-user SSE (Server-Sent Events) notification hub. They verify the three failure modes that are invisible from the wire: the exact byte format of each frame (including the trailing blank line), per-user routing isolation, and clean teardown on disconnect. The clock is faked and the Express response is hand-built so assertions can inspect raw bytes.

## Key elements

- **`makeResponse()`** — Builds a `FakeResponse` that records every string passed to `write` (the jest mock) into a `frames` array, captures `setHeader` calls into a `headers` map, and exposes a `disconnect()` that fires registered `close` handlers.
- **`open(userId, reverify?)`** (local helper) — Calls `streamNotifications` with the fake response, pushes the fake into a module-level `opened` array for cleanup, and returns the `FakeResponse`.
- **`FakeResponse`** (interface) — The observable surface: `frames`, `headers`, jest mocks for `end`/`write`/`status`/`flushHeaders`, and `disconnect()`.
- **`describe` blocks** — Cover: SSE headers & 200 status; exact frame byte format (`event:`, `data:`, `\n\n`); per-user routing (multi-tab same user, different user); no-throw publish to absent user; swallowed write-after-end errors; heartbeat as an SSE comment; teardown (registry cleanup, timer stop, other-tab retention); permission recheck (still-allowed keeps stream, denied ends it, thrown reverify fails closed).

## Relationships

- **`src/modules/notifications/services/stream.ts`** — The unit under test. Imports `streamNotifications` (the SSE handler), `publishToUser` (the push primitive), and `openStreamCount` (teardown/retention assertions).
- **`tests/support/stub.ts`** — Provides `asStub` to cast the partial mock object into a typed `Response` without touching the real type.
- **`src/kernel/registry.ts`** — Not directly imported here; the registry is exercised indirectly through `openStreamCount` assertions that confirm the stream's entry is added/removed from the kernel-level map.

## Notes

- Every test runs under `jest.useFakeTimers()`; `afterEach` disconnects all opened fakes and restores real timers, so no timer or map entry leaks between tests.
- The heartbeat frame is `: keep-alive\n\n` — an SSE comment, not an event — specifically so real clients see no data. The test asserts the exact string.
- The "fails closed" reverify test (`Promise.reject`) is intentional: a thrown check is treated as "no longer authorized," not as a transient error to retry.
- `asStub` is used solely for type-casting; the object is never passed to real Express internals.
