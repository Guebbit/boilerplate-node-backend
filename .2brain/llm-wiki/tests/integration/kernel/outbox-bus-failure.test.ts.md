---
source: tests/integration/kernel/outbox-bus-failure.test.ts
sha256: 8b9a5555ea151b359751bd6be195798dff53939f97068a148c38256839ce4303
generated_at: 2026-11-14T23:16:31.663960+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/kernel/outbox-bus-failure.test.ts

## Purpose

Integration test verifying that `relayOutbox` gracefully handles an event-bus rejection: the outbox row must retain the rejection message in `lastError` and remain in `pending` status rather than being silently lost. This covers a failure path (`emitDomainEvent` rejecting) that the function itself never triggers under normal operation.

## Key elements

- **Partial `jest.mock('@kernel/events', …)`** — Replaces only `emitDomainEvent` with a rejecting mock (`mockRejectedValue(new Error('bus broke'))`) and `domainEventsWired` with `() => true`; spreads `jest.requireActual` so the rest of the module still loads.
- **`setupTestDb()`** — Initializes the in-memory test database before any test runs.
- **`it('records the rejection message in lastError and reschedules', …)`** — Enqueues one event via `enqueueOutboxEvent` inside `withTransaction`, calls `relayOutbox()`, then asserts the return value is `{ retried: 1 }` and the persisted row still has `status: 'pending'` with `lastError` containing `"bus broke"`.

## Relationships

- **`src/kernel/outbox.ts`** — Source of the system under test (`relayOutbox`, `enqueueOutboxEvent`) and the model used to inspect the persisted row (`outboxEventModel`).
- **`src/infrastructure/runtime/database.ts`** — Provides `withTransaction`, used to enqueue the test event within a DB transaction.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb`, which configures the test database connection before tests execute.
- **`tests/support/stub.ts`** — Provides `asStub`, used to cast a minimal object (`{ n: 1 }`) to satisfy the aggregate-payload type without constructing a real domain object.

## Notes

- The mock is deliberately partial: spreading `requireActual` ensures other exports from `@kernel/events` (consumed by other kernel modules) remain functional during the test.
- `domainEventsWired: () => true` is included in the mock because the kernel's initialization path checks this; omitting it would cause the module to fail to wire up.
- The `as never` cast on `'test.outbox'` sidesteps the typed event-name constraint, since this test only cares about the failure path, not event routing.
