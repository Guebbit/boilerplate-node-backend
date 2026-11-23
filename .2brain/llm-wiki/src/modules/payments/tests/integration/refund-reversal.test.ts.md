---
source: src/modules/payments/tests/integration/refund-reversal.test.ts
source_sha256: 296d3cf73bb6f8004e4844f34d70ac07ce8a90396860ccaef2997b239601920d
context_sha256: df882b42d71c9bda6878082c2b38858d28328963cb4387df27a340284b67d13c
generated_at: 2026-11-22T07:00:40.920882+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refund-reversal.test.ts

## Purpose
Integration test (real Mongo, fake payment provider) for refunds the provider reports as failed. It covers two cases. A refund that had settled and then bounced re-opens as owed, once. A refund that was still open is failed for good by the provider's own word. In both cases it is never sent again, and redeliveries or a later success report change nothing.

## Key elements
- `settledRefund(amount = '30.00')` — helper that builds a user, a product (50.00) and an order of 2 items. It pays by card, issues an admin refund, settles the outbox nudges, and returns `{ orderId, payment, refundId, refundRef, providerRef }`.
- `deliverRefund(providerRef, refundRef)` — delivers the provider webhook via `deliver({ id: 'evt', ... })`.
- `stampOf(orderId)` — reads the order's `paymentStatus` through `orderService.getById`.
- `events(name)` — counts `outboxEventModel` rows for an event name.
- `describe('a settled refund the provider takes back')` tests:
  - **Re-opens as owed.** The refund becomes `failed` with `failureReason`, `reversedAt` and `reversedAfterSettling: true`, and `settledAt` is cleared. The order stamp goes from `partially_refunded` back to undefined. One `PAYMENT_REFUND_REVERSED` event is emitted, `displayStatus` is `refund_pending`, and `listAttention` shows a `reversed_refund` item.
  - **Another refund still stands.** The stamp stays `partially_refunded`.
  - **Redelivery or a later success report.** Nothing changes: the status stays `failed`, with one `PAYMENT_REFUND_REVERSED` and one `PAYMENT_REFUNDED` event.
  - **Retry sweep.** `retryOpenRefunds` (with `NODE_PAYMENT_REFUND_RETRY_MINUTES=0`) calls neither `refund` nor `retrieveRefund` on the provider.
  - **Hand settle.** `settleRefundByHand` closes the refund as `succeeded` with `settledByHand`, and `PAYMENT_REFUNDED` is announced again (2 total). The `getForOrder` actions offer `settleRefundByHand: [refundId]` and an empty `cancelRefund`. A late redelivery is a no-op.
- `describe('a webhook that beats refund()')` test: `fakePaymentProvider.refund` is spied on so the failure webhook arrives before refund()'s own answer. The record ends `failed` (reason `declined`) with `reversedAt` set. There are 0 `PAYMENT_REFUNDED` events, 1 `PAYMENT_REFUND_FAILED` and 0 `PAYMENT_REFUND_REVERSED`. `reversedAfterSettling` is undefined and attention shows `refused_refund`. A redelivered failure report adds no event and no attention item.

## Relationships
- `scenarios/support/doubles/payments/fake.ts` — the fake provider and its levers: `fakePaymentProvider`, `setFakeLateRefundFailure`, `setFakeRefundOutcome` and `refundRefOfRecord`.
- `src/modules/payments/services/index.ts` — `paymentService`: `getForOrder`, `listAttention`, `settleRefundByHand` and `retryOpenRefunds`.
- `src/modules/payments/repository.ts` — `paymentRepository`, used to inspect stored refunds.
- `src/modules/payments/events.ts` — the `PAYMENT_REFUNDED`, `PAYMENT_REFUND_FAILED` and `PAYMENT_REFUND_REVERSED` event names.
- `src/modules/payments/module.ts` — registered through `registerCheckoutModules([paymentsModule])`.
- `src/modules/payments/tests/deliver.ts` — webhook delivery via `deliver`.
- `src/modules/payments/tests/factories.ts` — the `payByCard` and `refundOrderPayment` helpers.
- `src/kernel/outbox.ts` — `outboxEventModel` and `settleOutboxNudges`.
- `src/kernel/events.ts` — `resetDomainEvents`, called in `afterEach`.
- `src/modules/orders/index.ts` — `orderService`, used to read the order's payment stamp.
- `src/modules/orders/services/index.ts` — a graph neighbor, not referenced directly in this file.
- `src/modules/orders/tests/factories.ts`, `src/modules/products/tests/factories.ts` and `src/modules/users/tests/factories.ts` — fixture builders.
- `tests/support/callers.ts` — `asAdmin` and `callerContextAs('admin')`.

## Notes
- `afterEach` calls `jest.restoreAllMocks()`, so the `refund`, `retrieveRefund` and `refund`-wrapping spies do not leak between tests.
- Outbox event counts are asserted only after `settleOutboxNudges()`.
- A refund that never settled is a "refusal" (`refused_refund`, no `reversedAfterSettling`, `PAYMENT_REFUND_FAILED`). One that settled first is a "reversal" (`reversed_refund`, `PAYMENT_REFUND_REVERSED`).
