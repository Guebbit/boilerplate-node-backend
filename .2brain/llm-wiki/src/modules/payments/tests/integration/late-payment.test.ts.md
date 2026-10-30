---
source: src/modules/payments/tests/integration/late-payment.test.ts
sha256: 8e08e356e7f69d80159da88a8f15966abe05e54253d0adf65fda4f4f09e268bc
generated_at: 2026-10-29T05:17:23.944011+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/late-payment.test.ts

## Purpose

Integration test for the race condition in which a payment settles after an order's inventory hold has been released but before the order's cancellation has run. It verifies the two branches (enough stock → order paid; stock gone → order stays pending, payment refunded, late cancellation ends the order) for both card payments (simulated via a fake PSP webhook) and offline bank-transfer payments, and guards the hard-delete lock on a refunded-but-unpaid order.

## Key elements

- **`expiredCardOrder(onHand)`** – Builds a card order with an expired hold: creates user + product, reserves stock, opens a payment intent, reads the `providerRef`, then releases the hold with reason `'expire'`. Returns ids and refs for the test body.
- **`heldOrderFor(user, product, extras?)`** – Creates an order for one unit and reserves it via `inventoryService.reserveForOrder`; throws if the hold is refused.
- **`levelOf(productId)`** – Flushes outbox nudges then reads the product's `{ onHand, reserved }` counters.
- **`refundsOf(orderId)` / `orderStatusOf(orderId)`** – Small readers over `paymentRepository` and `orderService` used in assertions.
- **`describe('a card payment that lands on a released hold')`** – Four cases: stock available → paid; stock sold → pending + refund (`reason: 'late_payment'`) + no hand-refund audit + late cancel; refund email sent via `enqueueEmail`; order cancelled before money lands → no retake, ledger shows only `reserve` + `expire`.
- **`describe('a hand-recorded payment that lands on a released hold')`** – Two cases for `bank_transfer`: stock sold → 409 reject, refund recorded as *not* `succeeded`, order stays pending; stock available → order paid.
- **`describe('an order handed money it could not take')`** – Asserts `hardDelete` is disabled and `removeById(id, true)` is refused when a succeeded payment with a refund is attached.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a jest mock so no real mail is dispatched.
- **`beforeEach`** – Clears the mailer mock and calls `registerCheckoutModules([paymentsModule])` to wire the payments module into the test-app context.
- **`afterEach`** – Calls `resetDomainEvents()` to prevent event leakage between tests.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider.confirm(ref, …)` simulates the PSP webhook that triggers settlement.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is mocked; tests assert the `payments.refund-issued` template was enqueued.
- **`src/infrastructure/observability/audit.ts`** – `registerAuditSink` captures `AuditEntry` objects; one test asserts no `payment.refund_owed_by_hand` entry exists for card refunds.
- **`src/kernel/events.ts`** – `resetDomainEvents` called in `afterEach`.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushed before stock/email assertions to resolve async outbox work.
- **`src/modules/inventory/index.ts`** – `inventoryService` used for `reserveForOrder`, `releaseForOrder`, `isStockBoundToOrder`, `isHoldReleased`, `listMovements`.
- **`src/modules/orders/index.ts`** – `orderService` used for `getById`, `expireReservationById`, `withActions`, `removeById`.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build test orders.
- **`src/modules/payments/module.ts`** – `paymentsModule` registered in `beforeEach`.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` reads payment + refund records.
- **`src/modules/payments/services/index.ts`** – `paymentService` drives `createIntent`, `applyWebhookSettlement`, `openTransferPayment`, `recordOfflinePayment`.
- **`src/modules/products/tests/factories.ts`** – `createProduct`, `countersOf` for product setup and stock assertions.
- **`src/modules/users/tests/factories.ts`** – `createUser` for test accounts.

## Notes

- This is a **true integration test**: `setupTestDb()` provides a real database; no service-level mocking beyond the mailer and the fake PSP.
- All stock assertions must be preceded by `settleOutboxNudges()` because the inventory cache refresh is dispatched through the outbox, not synchronously.
- The `eventually` helper wraps the email assertion because `enqueueEmail` is enqueued asynchronously via the outbox.
- Offline-payment refunds are recorded with a non-`succeeded` status (operator must complete the off-system refund), whereas card refunds are recorded as `succeeded` immediately.
- The hard-delete guard test depends on `orderService.withActions` flag evaluation; the `paidAt` field being `undefined` is part of the "money arrived but order was never paid" invariant.
