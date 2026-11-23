---
source: src/modules/payments/tests/integration/refund-provider-status.test.ts
source_sha256: b06c7902670e4c348b7321350e5341678faff53e08f2621663964624a8ed49cc
context_sha256: 0ad3a9b72abde16697c9cd66f45e884a28f0bce6e926b148e8c14d1228867110
generated_at: 2026-11-22T07:00:19.913417+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refund-provider-status.test.ts

## Purpose
Integration test (real Mongo, fake payment provider) for refunds whose provider-side status is `pending`. It checks that a refund the provider accepts but hasn't settled stays open and publishes no event. It also checks that the retry sweep re-reads it instead of re-sending it, and that a webhook naming the refund settles it.

## Key elements
- `setupTestDb()`: sets up the real test database. `beforeEach` registers `paymentsModule` via `registerCheckoutModules`. `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- `pendingRefund()`: test helper that:
  - creates a user, a product (price 50.00) and an order of 2 items, and pays by card (100.00);
  - calls `setFakeRefundPending(providerRef, true)`;
  - refunds 30.00 as admin via `refundOrderPayment`;
  - returns `orderId`, `providerRef`, `answer`, `payment`, `refundId` and `refundRef` (from `refundRefOfRecord`).
- `refundedEvents()`: counts `payment.refunded` (`PAYMENT_REFUNDED`) rows in `outboxEventModel`.
- Test 1: the refund answers `{ success: true, status: 201 }`. The record has `status: 'pending'` and `providerRefundRef`, no `settledAt`, and zero `payment.refunded` outbox rows.
- Test 2: runs with `NODE_PAYMENT_REFUND_RETRY_MINUTES=0`.
  - `paymentService.retryOpenRefunds()` returns 0 while the refund is still pending, and the test asserts `retrieveRefund` was called with `refundRef`.
  - After `setFakeRefundOutcome(refundRef, { status: 'succeeded' })`, it returns 1.
  - `fakePaymentProvider.refund` is never called, the refund is `succeeded`, and one event is emitted.
- Test 3: after the outcome is set to succeeded, `deliver` sends the same webhook (`evt_1`) twice. The refund ends `succeeded` with exactly one `payment.refunded` event.

## Relationships
- `scenarios/support/doubles/payments/fake.ts`: provides `fakePaymentProvider` and the levers `setFakeRefundPending`, `setFakeRefundOutcome` and `refundRefOfRecord`.
- `src/modules/payments/services/index.ts`: exports `paymentService`, whose sweep method is exercised by the tests.
- `src/modules/payments/repository.ts`: exports `paymentRepository`, used to read back the payment and its refunds.
- `src/modules/payments/tests/deliver.ts`: `deliver` simulates the provider webhook.
- `src/modules/payments/tests/factories.ts`: `payByCard` and `refundOrderPayment`.
- `src/kernel/outbox.ts`: `outboxEventModel` and `settleOutboxNudges` for checking and flushing emitted events.
- `src/kernel/events.ts`: `resetDomainEvents` for cleanup.
- `src/modules/payments/events.ts`: `PAYMENT_REFUNDED`.
- `src/modules/payments/module.ts`: `paymentsModule`, registered for the test.
- `src/modules/users/tests/factories.ts`, `src/modules/products/tests/factories.ts` and `src/modules/orders/tests/factories.ts`: build the fixture user, product and order.
- `tests/support/callers.ts`: `asAdmin` and `callerContextAs`.
- `tests/support/checkout-modules.ts`: `registerCheckoutModules`.
- `tests/support/environment.ts`: `withEnvironmentOverrides`.

## Notes
- Event assertions call `settleOutboxNudges()` first so the outbox has been processed before counting rows.
- `jest.spyOn(fakePaymentProvider, ...)` is used to observe provider calls. `restoreAllMocks` in `afterEach` undoes the spies.
- Setting the retry interval to `'0'` makes the open refund eligible for the sweep immediately.
