---
source: src/modules/payments/tests/integration/announce.test.ts
sha256: 0a7e44dbe98cffdff25c721758133410529c6f5ae23c7d1f8469b31f211f4f74
generated_at: 2026-10-29T05:15:31.626491+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/announce.test.ts

## Purpose

Integration tests that verify payment settlement announcements flow through the transactional outbox correctly. They assert atomicity (event row and state change commit or roll back together), idempotency (re-confirming a payment doesn't duplicate the event), and correct subscriber delivery — all against a real MongoDB via `setupTestDb`.

## Key elements

- **`placedOrder()`** – Creates a real user, product (10 on hand), and a 2-unit order in placed state via `orderService.create`.
- **`payFor(orderId, user)`** – Creates a payment intent then confirms it with a card ref (`pm_card_visa`), returning the settlement result.
- **`awaitingConfirmation()`** – Sets up an order with a created-but-unconfirmed card intent (the state a decline targets).
- **`heard`** (module-level array) – Collects `PAYMENT_SUCCEEDED` payloads captured by a subscriber registered in `beforeEach`; used to assert delivery count and event-id linkage.
- **`describe("a settlement that completes")`** – Verifies exactly one `payment.succeeded` outbox row with `status: 'published'` after `settleOutboxNudges()`, and that a second confirm of the same payment produces no additional row.
- **`describe("a settlement that dies after charging")`** – (a) Mocks `inventoryService.commitForOrder` to reject, asserts no outbox row and payment stays `requires_confirmation`; (b) Spies `fakePaymentProvider.confirm` to cancel the order mid-flight, asserts no `payment.succeeded` row.
- **`describe("a declined payment")`** – Exercises `recordDecline`: asserts atomic write of `payment.failed` outbox row, rollback when `outboxEventModel.create` rejects, and `null` return when the payment has already transitioned to `succeeded` (lost race).

## Relationships

- **`src/modules/payments/services/announce.ts`** – `recordDecline` is the primary unit under test in the decline block; its transactional semantics (status update + outbox row in one commit) are the contract being verified.
- **`src/kernel/outbox.ts`** – `outboxEventModel`, `relayOutbox`, `settleOutboxNudges` are exercised to assert row existence, status, and subscriber delivery; `outboxEventModel.create` is spied on to simulate write failure.
- **`src/kernel/events.ts`** – `onDomainEvent` / `resetDomainEvents` manage the subscriber lifecycle for `PAYMENT_SUCCEEDED` and `PAYMENT_FAILED`.
- **`src/modules/payments/events.ts`** – `PAYMENT_SUCCEEDED` and `PAYMENT_FAILED` constants name the outbox rows being queried.
- **`src/modules/payments/services/index.ts`** – `paymentService.createIntent` / `confirmPayment` drive the happy-path and settlement-failure scenarios.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` / `updateStatusIfIn` used for post-conditions and the race-condition test.
- **`src/modules/payments/module.ts`** – `paymentsModule` registered via `registerCheckoutModules` in `beforeEach`.
- **`src/modules/inventory/index.ts`** – `inventoryService.commitForOrder` is the call that is mocked to fail, triggering the rollback assertion.
- **`src/modules/orders/index.ts`** – `orderService.create` builds the order fixture; `orderService.cancelOnRequestById` is called inside the mid-confirmation spy.
- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider.confirm` is spied on to inject a concurrent order cancellation.
- **`src/modules/users/tests/factories.ts` / `src/modules/products/tests/factories.ts`** – `createUser`, `createProduct` provide real DB fixture data.
- **`tests/support/callers.ts`** – `asCustomer`, `testCallerContext`, `callerContextAs` supply the auth/permission context for every service call.

## Notes

- The tests use **real MongoDB** (via `setupTestDb`); the only mocks are at the service/provider boundary (`inventoryService.commitForOrder`, `fakePaymentProvider.confirm`, `outboxEventModel.create`).
- `settleOutboxNudges()` and `relayOutbox()` are explicit test-time invocations that stand in for the background relay a production process would run; they are required before asserting subscriber delivery or row `status: 'published'`.
- The "lost race" decline test calls `paymentRepository.updateStatusIfIn` to flip the payment to `succeeded` *before* invoking `recordDecline`, then expects `null` — the guard is an optimistic-status check inside `recordDecline`, not a transaction lock.
- `beforeEach` registers `paymentsModule` via `registerCheckoutModules`; forgetting this would leave the event bus unbound and all subscriber assertions would silently pass with empty arrays.
