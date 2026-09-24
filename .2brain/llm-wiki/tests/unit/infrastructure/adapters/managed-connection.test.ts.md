---
source: tests/unit/infrastructure/adapters/managed-connection.test.ts
sha256: a2dd6fa678f3e08cd1519f4ad77b5b97b9b5669f6833128d83526ab51b0c6699
generated_at: 2026-09-23T20:19:34.154753+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/managed-connection.test.ts

## Purpose

Unit tests for the `manageConnection` adapter's state machine and lifecycle guarantees. The file exists to pin four load-bearing properties—never rejecting to callers, never opening a second connection while one is in flight, warning exactly once per outage, and closing on shutdown even when a handle is mid-open—against a fake handle, so they are verified once without Redis or a broker.

## Key elements

- **`setup()`** — Factory returning a `manageConnection<FakeHandle>` wired with jest-mocked `connect`, `close`, and `isEnabled`, plus the `unavailableMessage` and `isReady` predicates. Each test block starts here.
- **`FakeHandle`** — Minimal `{ id: number; live: boolean }` interface standing in for a Redis client or AMQP channel; `live` drives the `isReady` check.
- **`deferred<T>()`** — Returns `{ promise, resolve, reject }` so a test can hold a `connect` promise open mid-flight and settle it at a chosen moment.
- **`describe('when the dependency is switched off')`** — Verifies `disabled` state, no `connect` call, and that `disabled` is not treated as a failure.
- **`describe('the reported state')`** — Walks the `unavailable → connecting → ready → unavailable` transition cycle.
- **`describe('the handle')`** — Covers single-open-and-reuse, replacement when `isReady` goes false, `forget()`-triggered reconnection, and concurrent-call deduplication.
- **`describe('a connect that fails')`** — Asserts `get()` resolves `undefined` (never rejects), retry-on-next-call, single warning per outage, latch re-arming after success, and shared latch with `reportUnavailable`.
- **`describe('a connect that declines to build a handle')`** — `connect` resolving `undefined` (config-level absence) reports unavailable with _no_ warning.
- **`describe('stop()')`** — Closes the live handle, waits for in-flight connects before closing, calls `close(undefined)` when no handle exists, and resolves even if `close` rejects.

## Relationships

- **`src/infrastructure/adapters/managed-connection.ts`** — The unit under test. `manageConnection` is imported and exercised through its public API (`get`, `state`, `forget`, `reportUnavailable`, `stop`).
- **`src/infrastructure/adapters/logger.ts`** — Mocked at module level (`jest.mock`). Tests assert `logger.warn` call counts to verify the once-per-outage warning contract without producing real log output.

## Notes

- The file-level comment frames the design intent: the four properties are tested _here_ so that `cacheState()` and `queueState()` (or any future dependency) cannot drift into interpreting `connecting` differently.
- `disabled` is a supported deployment state, not an error; the test explicitly guards against reporting it as broken.
- `forget()` is the reconnect path for handles that signal their own close (e.g. AMQP channel close); it intentionally does _not_ call `close` on the old handle.
- `stop()` must call `close` with `undefined` rather than skip the call—adapters like `queue.ts` hold a TCP connection under a channel and need the release signal even when the channel handle is gone.
- The warning latch is shared: a `connect` rejection and a subsequent `reportUnavailable` from an `error` event on a live handle count as the _same_ outage (one warning), but a new outage after a successful reconnect re-arms the latch.
- `connect` resolving `undefined` (handle cannot be built) is distinct from `connect` rejecting (connection refused): the former is silent, the latter warns.
