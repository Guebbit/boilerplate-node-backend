---
source: src/modules/orders/tests/integration/service-status.test.ts
sha256: e87bcfd27eafe69e67af72827287b4bfe88cd6da8f067c7f2c2909a1acff641f
generated_at: 2026-10-15T11:18:12.475465+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-status.test.ts

## Purpose

Integration tests for the order status-transition functions (`markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfilmentComplete`). Runs against a **real MongoDB** (not mocks) to verify that the conditional `$in` write guarantees exactly-once status moves under concurrent access, that `ORDER_STATUS_CHANGED` events are emitted through the outbox relay, that `withdrawUntil` is computed correctly, and that session-accepting variants commit atomically with the caller's transaction.

## Key elements

- **`setupTestDb()`** (top-level) — provisions a dedicated Mongo instance for the suite.
- **`beforeEach` / `afterEach`** — calls `markDomainEventsWired()` / `resetDomainEvents()` so the outbox relay has a subscriber to deliver to.
- **`inTransaction` helper** — wraps a door function in `withTransaction` from the database runtime, mimicking how `delivery`'s acts invoke session-based doors.
- **`describe('markPaid')`** — happy path (pending→paid, `paidAt` stamped) and refusal from paid / processing / cancelled.
- **`describe('markProcessing')`** — paid→processing, refusal from pending, and verification that `orderService.markProcessing` is reachable as a sibling.
- **`describe('markShipped')`** — processing→shipped, refusal from paid.
- **`describe('markDelivered')`** — shipped→delivered; `withdrawUntil` = end-of-day on day N (default 30) after the delivery date; `NODE_WITHDRAWAL_PERIOD_DAYS=21` shortens it.
- **`describe('markFulfilmentComplete')`** — physical order: processing→shipped→delivered in one write, two events, clock from the passed `at`; digital order: processing→delivered, clock from `paidAt`; refusal from paid/shipped/delivered leaves zero outbox rows; caller-transaction rollback reverts the order and emits nothing.
- **`describe('the doors that take the caller's session')`** — confirms the write is invisible until the caller's transaction commits, then exactly one outbox event exists.
- **`describe('two callers racing the same move')`** — two concurrent `markPaid` calls: exactly one returns a document, exactly one event fires.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/status.ts` | **SUT** — imports all five `mark*` functions under test. |
| `src/modules/orders/services/index.ts` | Imports `orderService` to verify doors are also reachable on the service object. |
| `src/modules/orders/events.ts` | Imports `ORDER_STATUS_CHANGED` for event assertions. |
| `src/kernel/events.ts` | `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` — subscribe, assert, and clean up the in-process event bus. |
| `src/kernel/outbox.ts` | `nudgeOutbox`, `outboxEventModel`, `settleOutboxNudges` — trigger and settle the relay, then assert on persisted outbox documents. |
| `src/modules/orders/tests/factories.ts` | `seedOrder`, `seedDigitalOrder`, `readOrder` — create and read test fixtures. |
| `tests/support/setup-test-db.ts` | `setupTestDb` — spins up the real Mongo instance. |
| `tests/support/environment.ts` | `withEnvironment` — temporarily sets `NODE_WITHDRAWAL_PERIOD_DAYS`. |
| `src/infrastructure/runtime/database.ts` | `withTransaction` — provides the session/transaction used by the `inTransaction` helper. |
| `src/types/index.ts` | `OrderStatus` enum — used in seeds, assertions, and parameterised cases. |

## Notes

- **Real Mongo is deliberate.** A mock cannot race against itself; the `$in` conditional write in `updateStatusIfIn` is the unit under guarantee, so the test must exercise it against a real store.
- **`settleOutboxNudges()` must precede every event assertion.** The relay is asynchronous; without settling, `onDomainEvent` callbacks may not have fired yet.
- **Session-accepting doors do not call `nudgeOutbox()` themselves.** The caller is responsible for nudging the relay after its own transaction commits (see `markFulfilmentComplete` tests).
- **`withdrawUntil` is always end-of-day** (`23:59:59.999Z`) of the computed deadline, not the exact delivery timestamp.
- **Digital orders** skip the `shipped` step and start the withdrawal clock from `paidAt`, not from the fulfilment-completion date.
- **`markDomainEventsWired()` in `beforeEach` is load-bearing.** Without it the outbox relay has no subscriber and events are silently dropped, making every event assertion fail.
