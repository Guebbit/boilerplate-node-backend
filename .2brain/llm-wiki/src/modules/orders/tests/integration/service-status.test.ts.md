---
source: src/modules/orders/tests/integration/service-status.test.ts
source_sha256: 8c4e1c56b9761c117cfd8eb5c6c665fad7d6a12cbd157a6b5873cfa3c8cfcdb6
context_sha256: f875f842632db2d2fbd4c11eaa68d9e31ef2901418b199ab101ea483b318c4dc
generated_at: 2026-11-22T06:33:52.731711+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/service-status.test.ts

## Purpose
Integration tests for the order status transitions in `src/modules/orders/services/status.ts`: the moves other modules report (paid, processing, shipped, delivered, fulfillment-complete). They run against a real Mongo instance because the guarantee under test is the conditional write (`updateStatusIfIn`'s `$in` filter), which a mock cannot race against itself.

## Key elements
- **`setupTestDb()`**: sets up the test database for the suite.
- **`beforeEach(markDomainEventsWired)` / `afterEach(resetDomainEvents)`**: the outbox relay only delivers in a process whose modules are subscribed, so the tests mark events as wired and then reset.
- **`describe('markPaid')`**:
  - pending → paid, announced once, with `paidAt` stamped in the same write
  - refused (the call returns a nullish result, no event) from paid, processing and canceled
- **`describe('markProcessing')`**:
  - paid → processing
  - refused from pending
  - also reachable as `orderService.markProcessing`
- **`describe('markShipped')`**:
  - processing → shipped
  - refused from paid
- **`describe('markDelivered')`**:
  - shipped → delivered, refused from processing
  - freezes `withdrawUntil` at the end of the 30th day after the delivery date passed in (`2026-03-31T23:59:59.999Z` for a 2026-03-01 delivery)
  - freezes `conformityUntil` (two-year guarantee) beside it
  - `NODE_WITHDRAWAL_PERIOD_DAYS=21` shortens the withdrawal period, applied via `withEnvironmentOverrides`
- **`inTransaction(door)`**: local helper that wraps a status function in `withTransaction`.
- **`describe('markFulfillmentComplete')`**:
  - a physical order goes processing → shipped → delivered in one write, announcing both moves; the withdrawal clock counts from the supplied `at`
  - a digital-only order (`seedDigitalOrder`) goes straight to delivered with one announced move, the clock counting from payment
  - refused from paid, shipped and delivered, leaving the outbox empty
  - a rollback of the caller's transaction leaves the status unchanged and the outbox empty
- **`describe('the doors that take the caller’s session')`**:
  - `markShipped` is invisible outside the transaction until commit, then visible, with one outbox event
  - `markDelivered` computes the deadline from the arrival date it is given
- **`describe('two callers racing the same move')`**: two concurrent `markPaid` calls on a pending order; the write lands and the event fires exactly once. The visible portion of the file ends partway through this test.

## Relationships
- **`src/modules/orders/services/status.ts`** (`markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfillmentComplete`) and **`src/modules/orders/services/index.ts`** (`orderService`): the code under test.
- **`src/modules/orders/tests/factories.ts`**: `seedOrder`, `seedDigitalOrder` and `readOrder` create and read orders directly.
- **`src/modules/orders/events.ts`** (`ORDER_STATUS_CHANGED`) and **`src/kernel/events.ts`** (`onDomainEvent`, `markDomainEventsWired`, `resetDomainEvents`): subscribe to and observe announced status changes.
- **`src/kernel/outbox.ts`**: `settleOutboxNudges` waits for delivery, `nudgeOutbox` wakes the relay after session-variant commits, and `outboxEventModel` is used to count persisted events.
- **`src/infrastructure/runtime/database.ts`**: `withTransaction` supplies the Mongo session.
- **`tests/support/setup-test-db.ts`** and **`tests/support/environment.ts`**: DB lifecycle and environment overrides.
- **`src/modules/orders/domain/index.ts`** (`NO_FULFILLMENT`, `FulfillmentSummary`) and **`src/types/index.ts`** (`OrderStatus`): imported for domain and type use. `OrderStatus` is used throughout the visible tests.

## Notes
- Status functions called without a session announce through the outbox; session variants leave it to the caller to call `nudgeOutbox()` after its own commit.
- Refusals show up as a falsy result from the status function rather than a thrown error.
- Comments in the file say `paidAt` is read by `src/modules/orders/services/scope.ts` (the `invoice` action flag) and `src/modules/users/services/remove.ts` (hard-delete refusal).
