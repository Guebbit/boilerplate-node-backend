# tests/unit/infrastructure/adapters/managed-connection.test.ts

## Purpose

Unit tests for the `manageConnection` lifecycle adapter, verifying its state machine, handle reuse, fail-open guarantees, and shutdown behavior using fake handles — no real Redis or RabbitMQ needed. The file exists so that the shared state rules (which both the cache and queue adapters rely on) are tested once against a single implementation.

## Key elements

- **`FakeHandle`** — minimal interface (`id`, `live`) standing in for a Redis client or AMQP channel.
- **`deferred<T>()`** — returns a promise with exposed `resolve`/`reject` so tests can hold a connect open mid-flight.
- **`setup()`** — factory that wires `manageConnection<FakeHandle>` with mocked `connect`, `close`, `isEnabled`, and `isReady`; returns the connection plus the spies.
- **Test suites** — organized by concern:
  - *switched off* — `disabled` state semantics, no connection opened.
  - *reported state* — full `unavailable → connecting → ready → unavailable` walk.
  - *the handle* — single-open, reuse, replacement on readiness loss, `forget()`, concurrent-caller dedup.
  - *a connect that fails* — resolves `undefined` (never rejects), retry-on-next-call, single-warning latch, re-arm after recovery, shared latch with `reportUnavailable`.
  - *a connect that declines to build* — `undefined` return means "not configurable", no warning logged.
  - *stop()* — closes live handle, waits for in-flight connect, calls `close(undefined)` when no handle, swallows close rejections.

## Relationships

- **`src/infrastructure/adapters/managed-connection.ts`** — the SUT. `manageConnection` is imported and exercised through the `setup()` helper; every test asserts its public API (`get`, `state`, `forget`, `reportUnavailable`, `stop`).
- **`src/infrastructure/adapters/logger.ts`** — mocked at module level. Tests assert on `mockedLogger.warn` call counts to verify the single-warning-per-outage latch.

## Notes

- The logger mock replaces the module entirely (`jest.mock` factory), so no real logging side-effects occur; assertions target `mockedLogger.warn` specifically.
- The "never rejects" contract is tested by asserting `resolves.toBeUndefined()` — a rejection would be a test failure, not a caught error.
- `connect` resolving `undefined` is distinct from rejecting: it means "cannot be built" (e.g., empty URL) and must not produce a warning.
- `stop()` calling `close(undefined)` (not skipping the call) is intentional: adapters that own resources beyond the handle (e.g., `queue.ts`'s TCP connection) must still release them.
