---
source: src/modules/payments/tests/integration/canceled.test.ts
source_sha256: 95c4b103047dccf51407852ccc24f9ef001e5570d436e340518a8d1503c8ad21
context_sha256: a402fa74eb97ccf08472cf5a8a80606dc8ccf713e0fafab7c06c4a9067057793
generated_at: 2026-11-22T06:56:13.302730+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/canceled.test.ts

## Purpose
Integration tests for the `canceled` payment status. They check that a payment is written `canceled` only after the provider confirms the intent closed. They also check that money landing late on a canceled payment is recorded as `succeeded` and refunded, and that other late reports (`processing`, `declined`) leave it alone. The provider side is the fake PSP, driven through `setFakeOutcome` and `confirm`. The application learns of changes only through the settlement entry points.

## Key elements
- **Setup**: `setupTestDb()`, `registerCheckoutModules([paymentsModule])` in `beforeEach`, and `resetDomainEvents()` in `afterEach`.
- **Read helpers**: `statusOf`, `refundCountOf`, `providerRefOf` (all via `paymentRepository.findByOrderId`) and `orderStatusOf` (via `orderService.getById`).
- **`canceledOrder()`**: creates a user, a product, and an order with a card intent. It then calls `orderService.cancelOnRequestById` and `settleOutboxNudges()`, and returns `{ user, orderId, providerRef }`.
- **"cancelling an order with an open intent"**:
  - The payment becomes `canceled`, and `presentPayment` shows `displayStatus` `canceled`.
  - A payment that never reached the provider (created directly via `paymentModel.create`) also becomes `canceled`.
  - If `fakePaymentProvider.cancel` rejects, the payment stays `requires_confirmation`.
- **"a late report on a canceled payment"**:
  - `processing` and `declined` (via `it.each`) change nothing and emit no `PAYMENT_FAILED` outbox event.
  - `syncPayment` does not call the provider's `retrieve` and returns `canceled`.
  - If money landed, `applyWebhookSettlement` records `succeeded` with one refund, `displayStatus` is `refunded`, and the order stays `canceled`.
  - A redelivered success adds no second refund.
  - `reconcileStalePayments()` skips it and returns 0 (run with `NODE_PAYMENT_RECONCILE_MINUTES=0`).
- **"the retention reaper"**: `paymentRepository.deleteAbandonedBefore` deletes an old canceled payment and keeps an old `succeeded` one.

## Relationships
- **`@modules/payments/services`** (`paymentService`): `createIntent`, `applyWebhookSettlement`, `syncPayment` and `reconcileStalePayments` are the code under test.
- **`@modules/orders`** (`orderService`): cancelling the order triggers the payment cancellation.
- **`@kernel/outbox`**: `settleOutboxNudges` drains the outbox after cancelling, and `outboxEventModel` is used to assert no `PAYMENT_FAILED` was recorded.
- **`@kernel/events`**: `resetDomainEvents` resets state between tests.
- **`@modules/payments/events`**: supplies the `PAYMENT_FAILED` constant.
- **`@modules/payments/repository`, `model` and `presenter`**: used to read and seed payments and to check `displayStatus`.
- **`@modules/payments/module`**: registered through `registerCheckoutModules`.
- **`@scenarios/support/doubles/payments/fake`**: provides `fakePaymentProvider` and `setFakeOutcome`.
- **Factories** (users, products, orders) and **`@tests/callers`** (`asCustomer`, `testCallerContext`): provide test data and caller identities.
- **`@tests/environment`** (`withEnvironmentOverrides`): sets the env override for the reconciliation test.

## Notes
- The `retrieve` spy in the buyer-sync test is installed after `canceledOrder()` because the cancel path may call `retrieve` itself.
- The `order.canceled` event reaches the payments listener through the outbox, not inline, so each test must call `settleOutboxNudges()`.
- The failed-cancel test uses `mockRejectedValueOnce` on `fakePaymentProvider.cancel`.
