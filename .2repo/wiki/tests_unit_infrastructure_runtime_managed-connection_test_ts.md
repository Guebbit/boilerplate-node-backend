# tests/unit/infrastructure/runtime/managed-connection.test.ts

## Purpose

Unit tests for `manageConnection`, the shared connection-lifecycle runtime used by both the Redis cache adapter and the RabbitMQ queue adapter. It verifies the four load-bearing invariants — never rejecting, no double-open during an in-flight connect, exactly one warning per outage, and clean shutdown — against a `FakeHandle` with no real Redis or broker involved.

## Key elements

- **`FakeHandle`** — minimal interface (`id`, `live`) standing in for a Redis client or AMQP channel; only enough to be identifiable and to report readiness.
- **`deferred<T>()`** — returns `{ promise, resolve, reject }` so a test can hold a connect open mid-flight and settle it on demand.
- **`setup()`** — wires `manageConnection<FakeHandle>` with jest-mocked `connect`, `close`, `isEnabled`, and a real `isReady` callback; returns the connection plus the spies.
- **`describe('when the dependency is switched off')`** — verifies `disabled` state, no connect call, and that toggling `isEnabled` off after a ready handle immediately flips state without closing.
- **`describe('the reported state')`** — walks the full `unavailable → connecting → ready → unavailable` transition in one test.
- **`describe('the handle')`** — single-open reuse, reconnection when `isReady` goes false, re-open via `forget()`, and concurrent-caller coalescing (second caller joins the in-flight attempt).
- **`describe('a connect that fails')`** — fail-open (resolves `undefined`), retry-on-next-call, single `logger.warn` per outage, latch re-arm after recovery, and shared latch with `reportUnavailable`.
- **`describe('a connect that declines to build a handle')`** — `connect` resolving `undefined` means "cannot be built"; no warning is logged.
- **`describe('stop()')`** — closes live handle, waits for in-flight connect before closing, calls `close(undefined)` when no handle exists, and never rejects even if `close` throws.

## Relationships

- **`src/infrastructure/runtime/managed-connection.ts`** — the module under test; this file imports `manageConnection` and exercises its public API (`get`, `state`, `forget`, `reportUnavailable`, `stop`).
- **`src/infrastructure/adapters/logger.ts`** — fully mocked (`jest.mock`) so the tests can assert exactly how many times `warn` is called without real I/O.

## Notes

- The mock for `logger` is applied at the top of the file via `jest.mock`, so it intercepts before `manageConnection` reads the import; `mockedLogger` is the typed handle for assertions.
- `setup()`'s default `connect` resolves a fresh `{ id: ++opened, live: true }`; tests that need timing control (concurrent callers, in-flight stop) override it with a `deferred` promise.
- The "single warning per outage" latch is the trickiest contract: it resets only after a successful connect, and `reportUnavailable` (external failures on a live handle) shares the same latch as `connect` rejections.
- `stop()` is the only path that tolerates a rejecting `close`; every other failure path (connect rejection, close rejection mid-shutdown) must resolve, not throw, to keep the process alive or let it exit cleanly.
