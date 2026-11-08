---
source: tests/unit/infrastructure/adapters/managed-connection.test.ts
sha256: c8d3e9171b4d16f8b8fa504217928c9ee9bca6eab46576a905cf729d9d50ae6a
generated_at: 2026-11-08T10:09:25.275760+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/managed-connection.test.ts

## Purpose

Unit tests for the `manageConnection` adapter, exercising its full lifecycle — state transitions, handle reuse, failure tolerance, shutdown — against a `FakeHandle` with no real Redis or AMQP dependency. The file exists so that the single set of state-machine rules (never reject, never double-connect, warn once per outage, close on exit) is verified once and shared by every optional dependency that reports through the adapter.

## Key elements

- **`FakeHandle`** — minimal interface (`id`, `live`) standing in for a Redis client or AMQP channel; only needs to be identifiable and toggleable for readiness.
- **`deferred<T>()`** — returns a promise plus `resolve`/`reject` handles so tests can hold a connect in-flight and control its settlement.
- **`setup()`** — builds a `manageConnection<FakeHandle>` instance with jest-mocked `connect`, `close`, and `isEnabled` callbacks; returns the connection and all mocks for assertions.
- **`mockedLogger`** — the jest-mocked `logger` singleton used to assert warning-latch behaviour.
- **Test suites** — `when the dependency is switched off`, `the reported state`, `the handle`, `a connect that fails`, `a connect that declines to build a handle`, `stop()`. Each suite pins one load-bearing property of the adapter.

## Relationships

- **`src/infrastructure/adapters/managed-connection.ts`** — the module under test; the test imports and calls `manageConnection` with a `FakeHandle`-typed config object.
- **`src/infrastructure/adapters/logger.ts`** — mocked at the module boundary; the test asserts call counts on `warn` to verify the once-per-outage latch and its re-arm after a successful connect.

## Notes

- `disabled` is treated as a distinct, non-error state; the test explicitly asserts it is *not* reported as `unavailable` to avoid training health-payload readers to ignore the field.
- `connect` resolving `undefined` (vs. rejecting) is a different scenario: it means "cannot be built" and must **not** emit a warning.
- The `stop()` suite includes a case where `close` is called with `undefined` rather than skipped, because real adapters (e.g. the queue adapter) may hold resources beyond the handle itself.
- The warning latch is shared between `connect` failures and `reportUnavailable` calls — both are treated as the same outage by the test.
