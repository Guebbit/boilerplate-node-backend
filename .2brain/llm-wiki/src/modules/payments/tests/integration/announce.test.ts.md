---
source: src/modules/payments/tests/integration/announce.test.ts
sha256: ccc4eb05a7b411203db4065dd722e1ccd1962055dd00c98f9bed27773ee0ef55
generated_at: 2026-10-15T11:33:16.291555+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/announce.test.ts

## Purpose

Integration test for the payment **announcement** (outbox delivery) flow. Verifies that `payment.succeeded` and `payment.failed` domain events are written in the same transaction as the state change (transactional outbox), delivered exactly once, and that rollback/race conditions leave no spurious events. Runs against a real MongoDB instance.

## Key elements

- **`heard` / `failures` arrays** – in-test collectors that record every `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` event a subscriber receives, including the outbox row's `_id`.
- **`placedOrder()`** – creates a real user, a product with stock, and a placed (units-held) order via `orderService.create`.
- **`payFor(orderId, user)`** – shorthand for `createIntent` → `confirmPayment` with a Visa card token.
- **`awaitingConfirmation()`** – creates an order + intent but leaves the payment unconfirmed (the state `recordDecline` expects).
- **`describe('a settlement that completes')`** – asserts exactly one `payment.succeeded` outbox row, correct `aggregateId`, and idempotency (second confirm is a no-op).
- **`describe('a settlement that dies after charging')`** – mocks `inventoryService.commitForOrder` rejection to prove the payment never commits and no event is emitted; also covers the cancelled-order-during-confirm case.
- **`describe('a declined payment')`** – exercises `recordDecline` directly: atomic write of status + outbox row, rollback when `outboxEventModel.create` rejects, and the null-return path when the payment already left `requires_confirmation`.

## Relationships

- **`src/kernel/outbox.ts`** – `outboxEventModel` (asserted directly), `settleOutboxNudges` (triggers relay), `relayOutbox` (flushes pending nudges).
- **`src/kernel/events.ts`** – `onDomainEvent` / `resetDomainEvents` wire up and tear down the test subscriber.
- **`src/modules/payments/services/announce.ts`** – `recordDecline` is the SUT for the decline describe block.
- **`src/modules/payments/services/index.ts`** – `createIntent`, `confirmPayment` drive the happy-path and failure scenarios.
- **`src/modules/payments/repository.ts`** – `paymentRepository` is queried to assert post-condition status (`requires_confirmation`, `succeeded`).
- **`src/modules/payments/events.ts`** – `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED` constants used for outbox row filters and event subscriptions.
- **`src/modules/payments/module.ts`** – `paymentsModule` registered so the service container resolves.
- **`src/modules/orders/index.ts`** – `orderService.create` builds the fixture; `orderService.cancelById` simulates concurrent cancellation.
- **`src/modules/inventory/index.ts`** – `inventoryService.commitForOrder` is spied to inject a mid-transaction failure.
- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider.confirm` is mocked once to inject an order cancellation inside the confirm call.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a product with stock for the order fixture.

## Notes

- The test suite relies on **real Mongo** (`setupTestDb`), not an in-memory or mocked driver; all repository reads are genuine queries.
- The core invariant under test: *an outbox row for `payment.succeeded` exists **if and only if** the payment status is `succeeded` in the same committed transaction.* The "dies after charging" and "rolls back on disk-full" cases guard the two halves of that biconditional.
- `recordDecline` returning `null` (rather than throwing) is the API contract for the lost-race case; the test asserts no outbox row is written in that path.
- `settleOutboxNudges` must be awaited before asserting on `outboxEventModel` rows — it is what moves a pending row to `published` in the test's outbox pipeline.
