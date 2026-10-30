---
source: src/modules/orders/tests/integration/service-status.test.ts
sha256: 3d1a897c4ee87f9c5b09fa6501260f2f61f09c09904eb4771ca80a599da51cb8
generated_at: 2026-10-29T04:57:28.721139+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-status.test.ts

## Purpose

Integration tests for the five status-transition functions in `services/status.ts` (`markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfilmentComplete`). The file runs against a **real MongoDB** instance to verify the conditional-write guarantee (`$in` filter), domain-event emission, outbox delivery, transaction isolation, and concurrent-race safety—behaviours a mock cannot exercise.

## Key elements

- **`setupTestDb()`** — boots a real Mongo for the entire suite (called once at module level).
- **`beforeEach` / `afterEach`** — wires and resets the domain-event bus so the outbox relay is active during every test.
- **`describe('markPaid')`** — happy-path (pending → paid, `paidAt` stamped in the same write) and refusal from paid/processing/cancelled (returns `null`, no event).
- **`describe('markProcessing')`** — paid → processing; refusal from pending; also verifies `orderService.markProcessing` exposure on the service object.
- **`describe('markShipped')`** — processing → shipped; refusal from paid.
- **`describe('markDelivered')`** — shipped → delivered; asserts `withdrawUntil` (end of 30th day) and `conformityUntil` (two-year guarantee) deadlines; uses `withEnvironmentOverrides` to test a shorter `NODE_WITHDRAWAL_PERIOD_DAYS`.
- **`inTransaction` helper** — thin wrapper around `withTransaction` used by `markFulfilmentComplete` and session-door tests.
- **`describe('markFulfilmentComplete')`** — physical path (processing → shipped → delivered in one write, two events), digital-only path (processing → delivered, clock from `paidAt`), refusal from wrong states, and rollback on a thrown error after the write.
- **`describe('the doors that take the caller's session')`** — verifies that session-based doors (`markShipped`, `markDelivered`) commit and emit events only at the caller's transaction boundary.
- **`describe('two callers racing the same move')`** — fires two concurrent `markPaid` calls; asserts exactly one succeeds and one event is emitted.

## Relationships

- **`src/modules/orders/services/status.ts`** — the system under test; all five `mark*` functions are imported and exercised directly.
- **`src/modules/orders/services/index.ts`** — `orderService` is imported to confirm the status functions are reachable on the aggregated service object.
- **`src/modules/orders/events.ts`** — `ORDER_STATUS_CHANGED` is subscribed to via `onDomainEvent` and asserted in every delivery test.
- **`src/kernel/events.ts`** — `markDomainEventsWired` / `resetDomainEvents` manage the in-process event bus; `onDomainEvent` registers test listeners.
- **`src/kernel/outbox.ts`** — `nudgeOutbox` wakes the relay after a caller commits a session transaction; `settleOutboxNudges` flushes pending deliveries before assertions; `outboxEventModel` is queried to count persisted events.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` provides the `ClientSession` used by `markFulfilmentComplete` and the session-door tests.
- **`src/modules/orders/tests/factories.ts`** — `seedOrder`, `seedDigitalOrder`, and `readOrder` create and inspect fixture documents.
- **`src/types/index.ts`** — `OrderStatus` enum values used throughout assertions.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` temporarily sets `NODE_WITHDRAWAL_PERIOD_DAYS` to verify configurable deadlines.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the real Mongo connection for the suite.

## Notes

- **Real Mongo, not mocks.** The file's header explicitly states that the conditional-write guarantee (`$in` filter) and race semantics cannot be tested with a mock.
- **Outbox timing is two-step.** Session-based doors require the *caller* to call `nudgeOutbox()` after its own `withTransaction` resolves, then `settleOutboxNudges()` to flush before asserting on events. Non-session doors can `settleOutboxNudges()` immediately.
- **`markDomainEventsWired()` is mandatory per-test.** Without it the outbox relay has no subscription and no events are delivered, even if the write succeeds.
- **`paidAt` is an invariant, not a side-effect.** The test asserts it lands in the *same* write as the status change because downstream modules (`services/scope.ts`, `services/remove.ts`) read it.
- **File is truncated in the dependency snapshot.** The final race-condition test ("two callers racing the same move") is cut off after the `Promise.all` setup; the remainder (assertions on `first`/`second` and event count) is not visible.
