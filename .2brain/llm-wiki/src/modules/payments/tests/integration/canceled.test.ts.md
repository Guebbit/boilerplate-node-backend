---
source: src/modules/payments/tests/integration/canceled.test.ts
sha256: ce71fd04590571756fe9b61f84d21dc10ec7cae639a7a0b60e029d1a29a636b9
generated_at: 2026-11-08T07:31:39.844919+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/canceled.test.ts

## Purpose

Integration tests covering the **canceled** payment lifecycle: what happens when an order is canceled while a payment intent is open, how late provider reports (webhooks, buyer sync, reconciliation) interact with a canceled payment, and the retention reaper's treatment of canceled records. The provider side is driven by a fake PSP; the application side is exercised only through its public settlement and service entry points.

## Key elements

- **`canceledOrder()`** — shared fixture: creates a user, product, order, and an unconfirmed card intent, then cancels the order and flushes the outbox. Returns `{ user, orderId, providerRef }`.
- **`statusOf` / `refundCountOf` / `providerRefOf` / `orderStatusOf`** — one-liner query helpers that read a single field back from the repository or order service.
- **`describe('cancelling an order with an open intent')`** — three cases: provider confirms the close → status becomes `canceled`; payment never reached the provider → still `canceled`; provider refuses to cancel → status unchanged (`requires_confirmation`).
- **`describe('a late report on a canceled payment')`** — verifies that `processing`/`declined` webhooks are ignored, buyer sync returns the canceled status unchanged, a late `confirm` flips status to `succeeded` and issues a full refund (display `refunded`), the refund is idempotent on redelivery, and the reconciliation sweep skips the payment.
- **`describe('the retention reaper')`** — calls `paymentRepository.deleteAbandonedBefore(future, future)` and asserts that a canceled payment is deleted while a succeeded one is kept.
- **`beforeEach` / `afterEach`** — registers the payments (and checkout) module, then resets domain events between tests.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — provides `fakePaymentProvider` and `setFakeOutcome`; the test uses `confirm()` to simulate a late card capture and `setFakeOutcome()` to simulate a late webhook status.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears accumulated domain events between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes the outbox so that `order.canceled` listeners actually run; `outboxEventModel` is queried to assert (or disprove) a `PAYMENT_FAILED` event.
- **`src/modules/orders/index.ts`** — `orderService` is used to cancel the order and read back its status.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` and `toOrderItem` build the order fixture.
- **`src/modules/payments/events.ts`** — `PAYMENT_FAILED` constant used in the outbox-event assertion.
- **`src/modules/payments/model.ts`** — `paymentModel.create` is called directly to seed a `requires_confirmation` record that never went through `createIntent`, and to seed the "succeeded" record in the retention test.
- **`src/modules/payments/module.ts`** — `paymentsModule` is registered in `beforeEach` so its event listeners are active.
- **`src/modules/payments/presenter.ts`** — `presentPayment` is used to verify the buyer-facing `displayStatus` (`canceled`, `refunded`).
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` and `deleteAbandonedBefore` are the primary read/delete surfaces under test.
- **`src/modules/payments/services/index.ts`** — `paymentService.createIntent`, `applyWebhookSettlement`, `syncPayment`, and `reconcileStalePayments` are the application entry points the test drives.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the product fixture.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the buyer fixture.
- **`tests/support/callers.ts`** — `asCustomer` and `testCallerContext` supply the authenticated caller context for service calls.

## Notes

- The `order.canceled` event reaches the payments listener **through the outbox, not inline**; every test that cancels an order must call `settleOutboxNudges()` before asserting payment status.
- The "money landed on a canceled payment" path is the only case where the status *changes* after cancellation (to `succeeded` + full refund). All other late reports must leave the status untouched.
- The reconciliation test uses `withEnvironmentOverrides` to set `NODE_PAYMENT_RECONCILE_MINUTES` to `'0'` so the sweep's staleness window is zero and the payment is eligible for processing (but then skipped because it is already `canceled`).
- The retention-reaper test passes a **future** date to `deleteAbandonedBefore`, making every existing record "old enough" to be candidates; the assertion is purely about *status-based* filtering (canceled deleted, succeeded kept).
