---
source: src/modules/payments/tests/integration/cancel-redelivery.test.ts
source_sha256: 1babb9c0bd31076a0bacf15f9cd49480f5d3f9c0a5f4072e1935210832875e93
context_sha256: 7ced6d0c158bd194c2503bbc868c32537eaf2b285c09078b141035a151cf5d19
generated_at: 2026-11-22T06:55:55.813108+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/cancel-redelivery.test.ts

## Purpose
Integration test suite proving that a redelivered `order.canceled` event never refunds twice. The outbox redelivers an event until its listener resolves, and staff may have voided the refund the first delivery opened in between. The payment must therefore remember the event id (`handledCancelEvents`) rather than infer "done" from the refund still being present. Tests drive the real listener through `emitDomainEvent` with an `eventId`, against real Mongo and the fake payment provider.

## Key elements
- **Setup:** `setupTestDb()`, `registerCheckoutModules([paymentsModule])` before each test, and `resetDomainEvents()` plus `jest.restoreAllMocks()` after each.
- **Helpers:**
  - `freshOrder`: a 100.00 order (two units at 50.00).
  - `paidCardOrder`: a card order paid in full.
  - `cashOrder`: a cash order recorded as paid offline by an admin.
  - `paymentOf` and `field`: read the stored payment or one of its fields.
  - `deliverCancel(orderId, eventId)`: emits `ORDER_CANCELED` with `refund: true`, `cause: 'operator'` and the given `eventId`, as the relay does.
  - `voidRefund`: staff void a refund via `paymentService.cancelRefund`.
- **`describe` blocks:**
  - *Redelivered cancel after staff voided the refund:*
    - A card is not paid again: no new record, and the provider is asked once.
    - A hand-paid refund is not owed twice: one record, one owed row, one `PAYMENT_REFUND_OWED_BY_HAND` event.
    - A different event id still refunds.
    - An emit without an event id remembers nothing.
  - *Cancel event that found nothing to return:*
    - The event marks itself when the refund was already requested and the provider refused it.
    - The event marks itself on a not-yet-succeeded payment, so money that lands later via `applyWebhookSettlement` is not paid twice.
  - *Cancel event that fails or races itself:*
    - A write that throws marks nothing.
    - A crash before the mark pays nothing twice, because the write that opens the refund also stamps the event.
    - A write that keeps missing makes the listener fail after `CANCEL_EVENT_WRITE_RETRIES + 1` attempts without marking the event.
    - Concurrent deliveries of one event open one record. This test is cut off in the visible content.

## Relationships
- **`@kernel/events`:** `emitDomainEvent` and `resetDomainEvents` fire and reset the listener under test.
- **`@kernel/outbox`:** `outboxEventModel` counts owed-by-hand rows, and `settleOutboxNudges` flushes pending outbox work.
- **`@modules/orders`:** supplies `ORDER_CANCELED`.
- **`@modules/payments/services`:** `paymentService` provides `recordOfflinePayment`, `createIntent`, `cancelRefund` and `applyWebhookSettlement`.
- **`@modules/payments/services/refunds`:** `CANCEL_EVENT_WRITE_RETRIES` sets the retry bound.
- **`@modules/payments/repository`:** `paymentRepository` is read directly. `addRefund` and `markCancelEventHandled` are spied on to inject failures.
- **`@modules/payments/events`:** `PAYMENT_REFUND_OWED_BY_HAND`.
- **`@modules/payments/module`:** `paymentsModule` is registered for the tests.
- **`@scenarios/support/doubles/payments/fake`:** `fakePaymentProvider` (`refund` is spied on, `confirm` is called) and `setFakeRefundFailure`.
- **Test factories:** the users, products, orders and payments `tests/factories` modules (`payByCard`, `refundOrderPayment`), plus `@tests/callers`, `@tests/checkout-modules`, `@tests/environment` and `@tests/setup-test-db`.

## Notes
- Card-refund tests wrap their body in `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })`.
- `deliverCancel` returns `true` when the listener resolves and `false` when it throws. The tests use this to model the outbox redelivery contract.
- `mockResolvedValue(null)` on `addRefund` simulates a write that keeps missing.
