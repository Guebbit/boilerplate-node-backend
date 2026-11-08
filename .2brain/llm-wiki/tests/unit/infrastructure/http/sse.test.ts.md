---
source: tests/unit/infrastructure/http/sse.test.ts
sha256: 6ecacd826ea4639bf01c2466cbb42175f43e7dedd5d20a5422e9045e46ef7490
generated_at: 2026-11-08T10:18:45.331861+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/sse.test.ts

## Purpose

Unit tests for `openSseStream`, the shared SSE opener. The tests verify that the function sets the correct `text/event-stream` headers, keeps the stream alive while the caller's recheck resolves truthy, and guarantees a run-once teardown whether the stream is closed by a failed recheck or by a socket disconnect. All timers are faked and the Express `Response` is hand-built so every header value, call count, and interval boundary is exact.

## Key elements

- **`REVERIFY_INTERVAL_MS`** (30 000) – constant matching the production recheck period; used to advance fake timers by exact multiples.
- **`makeResponse()`** – local helper that builds a minimal Express `Response` stub (via `asStub`) with tracked `setHeader` calls, a `close` handler registry, and a `disconnect()` method that simulates a socket drop. Returns the stub plus the individual jest mocks (`status`, `end`, `flushHeaders`) for assertions.
- **`describe('openSseStream')`** – the test suite. Uses `jest.useFakeTimers()` in `beforeEach` and restores real timers in `afterEach`. Contains four cases:
  - *headers test* – asserts 200, the three SSE headers, and that `flushHeaders` fires before any body write.
  - *keeps-alive test* – advances three intervals with a truthy recheck; asserts `end` and `onClose` cleanup are never called.
  - *recheck-fails test* (`it.each`) – parametrized over "says no" and "rejects"; asserts `end` and cleanup fire exactly once even if a disconnect arrives after `end()`.
  - *disconnect test* – registers two `onClose` handlers, triggers `disconnect()`, asserts both run once and that the recheck callback is no longer invoked.

## Relationships

- **`src/infrastructure/http/sse.ts`** – module under test; the file imports `openSseStream` from here.
- **`tests/support/stub.ts`** – provides `asStub`, which `makeResponse()` uses to create the typed `Response` mock.

## Notes

- The test never touches the network or a real Express server; the `Response` object is a plain-object stub, so assertions are on mock call counts, not side effects.
- The "run-once" guarantee is tested explicitly: in the recheck-fails case, a `disconnect()` is fired *after* `end()` to prove the cleanup does not run a second time.
- `src/kernel/registry.ts` appears as a graph neighbor (likely the real recheck implementation behind the opaque `() => Promise.resolve(true/false)` callbacks), but the test file never imports or names it directly.
