---
source: src/modules/payments/tests/integration/refund-provider-status.test.ts
sha256: 069746849e2770e7a6b05f6eba6d90ceddcaad0f7741ba1a0d605cef8c42dfdf
generated_at: 2026-11-08T07:35:19.622746+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-provider-status.test.ts

## Purpose

Integration test (real Mongo) for the full lifecycle of a refund the provider accepts but holds in `pending`: it must answer 201 without announcing, be re-read (not re-sent) by the open-refund sweep, and settle exactly once via the provider or a webhook. Exercises the fake provider's `pending` lever and the outbox.

## Key elements

- **`pendingRefund()`** — Builds a user, product (2 × 50.00), order, card payment (100.00), then issues a 30.00 refund with the fake provider set to `pending`. Returns `{ orderId, providerRef, answer, payment, refundId, refundRef }` for assertions.
- **`refundedEvents()`** — Counts `payment.refunded` rows in the outbox (`outboxEventModel`).
- **`describe('a refund the provider accepts but has not settled')`** — Three cases:
  - *201 + no announcement*: refund stays `pending`, `settledAt` is undefined, outbox has 0 `PAYMENT_REFUNDED` events even after `settleOutboxNudges`.
  - *Sweep re-reads, never re-sends*: with `NODE_PAYMENT_REFUND_RETRY_MINUTES=0`, first `retryOpenRefunds()` call returns 0 (still pending, only `retrieveRefund` called). After `setFakeRefundOutcome(refundRef, {status:'succeeded'})`, a second call returns 1, `refund()` is never invoked, status flips to `succeeded`, and exactly 1 outbox event appears.
  - *Webhook settles, redelivery is idempotent*: `applyWebhookDelivery` called twice with the same event id; status is `succeeded` and outbox holds exactly 1 event.

## Relationships

- **`@scenarios/support/doubles/payments/fake`** — Source of `fakePaymentProvider` (spied on for `refund`/`retrieveRefund`), `setFakeRefundPending`, `setFakeRefundOutcome`, `refundRefOfRecord`.
- **`@kernel/outbox`** — `settleOutboxNudges` flushes deferred event publication; `outboxEventModel` is queried to assert announcement counts.
- **`@kernel/events`** — `resetDomainEvents` in `afterEach` prevents cross-test leakage.
- **`@modules/payments/services`** — `paymentService.retryOpenRefunds` and `paymentService.applyWebhookDelivery` are the units under test.
- **`@modules/payments/repository`** — `paymentRepository.findByOrderId` used for post-state assertions.
- **`@modules/payments/events`** — `PAYMENT_REFUNDED` constant identifies the outbox document to count.
- **`@modules/payments/module`** — Registered via `registerCheckoutModules` in `beforeEach`.
- **`@modules/payments/tests/factories`** — `payByCard`, `refundOrderPayment` drive the initial payment and refund calls.
- **`@modules/orders/tests/factories`**, **`@modules/users/tests/factories`**, **`@modules/products/tests/factories`** — Create the order/user/product fixture data.
- **`@tests/environment`** — `withEnvironmentOverrides` sets `NODE_PAYMENT_REFUND_RETRY_MINUTES` to `0` for the sweep test.
- **`@tests/checkout-modules`** — `registerCheckoutModules` wires the module into the test app.
- **`@tests/callers`** — `asAdmin`, `callerContextAs('admin')` supply auth context for the refund call.
- **`@tests/setup-test-db`** — `setupTestDb` initialises the real Mongo instance.

## Notes

- The sweep test explicitly asserts `fakePaymentProvider.refund` was **never** called — the sweep path is read-then-settle, not re-submit. This is the behavioral guarantee under test.
- `NODE_PAYMENT_REFUND_RETRY_MINUTES` is set to `'0'` only in the sweep case; the other two cases do not override it.
- The webhook test passes the literal provider name `'fake'` to `applyWebhookDelivery`; the fake provider's identity is what matches.
- Test 2 uses `jest.spyOn` + `mockClear` on both `refund` and `retrieveRefund` to isolate call counts between the two sweep invocations.
