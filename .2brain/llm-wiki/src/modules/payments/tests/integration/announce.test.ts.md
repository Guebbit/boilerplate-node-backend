---
source: src/modules/payments/tests/integration/announce.test.ts
sha256: f90de07447b399471532314b0521ff9edf2b6dd75809320ca691815ac415046a
generated_at: 2026-11-08T07:31:21.195807+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/announce.test.ts

## Purpose

Integration tests for the payment announcement path: verifying that `payment.succeeded` and `payment.failed` domain events are published via the transactional outbox, atomically with the payment state change. Confirms idempotency (no double-publish on re-confirm), rollback when a downstream commit fails, and that declined payments are written and announced as a single unit. Runs against a real MongoDB instance.

## Key elements

- **`placedOrder()`** — helper that creates a user, a product (10 on hand), and a real placed order through `orderService.create`.
- **`payFor(orderId, user)`** — helper that creates a payment intent and confirms it with a fake Visa card via `paymentService`.
- **`awaitingConfirmation()`** — helper that sets up an order with an unconfirmed intent, i.e. the state `recordDecline` expects to find.
- **`describe('a settlement that completes')`** — asserts exactly one outbox row for `PAYMENT_SUCCEEDED`, that a subscriber received it with the correct `eventId`, and that a second confirm of the same payment does not produce a second row.
- **`describe('a settlement that dies after charging')`** — mocks `inventoryService.commitForOrder` to reject, asserting the payment stays `requires_confirmation` and no outbox row exists; also covers the cancel-during-confirm race where the refund path (not the payment) owns the announcement.
- **`describe('a declined payment')`** — calls `recordDecline` directly; asserts the `PAYMENT_FAILED` outbox row is written and delivered once; verifies rollback when `outboxEventModel.create` rejects; verifies that if the payment already moved to `succeeded`, `recordDecline` returns `null` and nothing is published.
- **`heard` / `failures` arrays** — module-level capture arrays populated by `onDomainEvent` subscribers to assert subscriber delivery in order.

## Relationships

- **`src/modules/payments/services/announce.ts`** — `recordDecline` is the system under test for the decline path.
- **`src/modules/payments/services/index.ts`** — `paymentService.createIntent` / `confirmPayment` drive the happy-path and re-confirm scenarios.
- **`src/modules/payments/events.ts`** — provides `PAYMENT_SUCCEEDED` and `PAYMENT_FAILED` event-name constants used in outbox queries and subscriptions.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` / `updateStatusIfIn` used to inspect and manipulate payment status directly.
- **`src/kernel/outbox.ts`** — `outboxEventModel` (queried/spied for assertions), `settleOutboxNudges` (flushes pending writes), `relayOutbox` (drives delivery).
- **`src/kernel/events.ts`** — `onDomainEvent` / `resetDomainEvents` manage the in-process subscriber registry.
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` stands in for Stripe; spied on to interleave a cancel call inside `confirm`.
- **`src/modules/inventory/services/index.ts`** — `inventoryService.commitForOrder` is the downstream step whose failure triggers the rollback scenario.
- **`src/modules/orders/index.ts`** — `orderService.create` (setup) and `orderService.cancelOnRequestById` (cancel-during-confirm race).
- **`src/modules/payments/module.ts`** — registered in `beforeEach` via `registerCheckoutModules` so the module's event wiring is active.
- **`src/modules/users/tests/factories.ts` / `src/modules/products/tests/factories.ts`** — `createUser` / `createProduct` seed real documents.
- **`tests/support/callers.ts`** — `asCustomer`, `testCallerContext`, `callerContextAs` provide authorization context for service calls.

## Notes

- **Real Mongo, not in-memory.** The module docblock and `setupTestDb()` make this explicit; tests exercise actual transactions, so outbox atomicity is genuinely verified.
- **Two-step outbox assertion.** After a service call you must call `settleOutboxNudges()` before querying `outboxEventModel`; use `relayOutbox()` only when you also need the relay (delivery) step exercised.
- **Idempotency is a first-class concern.** The re-confirm test calls `confirmPayment` a second time with the *same* payment `_id` and asserts the outbox count stays at 1.
- **Decline race is a lost-update guard.** `recordDecline` uses `updateStatusIfIn` (CAS-style); if the row is already `succeeded`, it returns `null` and writes no outbox row. The test pre-sets status to `succeeded` to exercise this.
- **`jest.restoreAllMocks()` in `afterEach`** is the only spy cleanup; individual tests use `mockRejectedValueOnce` / `mockImplementationOnce` so they self-exhaust, but the restore is a safety net.
