---
source: src/modules/payments/tests/integration/refund-failed-event.test.ts
source_sha256: e8dd3057d4021e96d96921b657f42287e7bd97df84e5bcc5e1a29c663e18e5b7
context_sha256: 82e0d7f768aa6127009d1210c7913cc836ffc061418aec1367de2c508fea6d55
generated_at: 2026-11-22T06:59:48.117999+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refund-failed-event.test.ts

## Purpose
Integration test (real Mongo, fake payment provider) for the `payment.refund_failed` outbox event. It checks that the event is announced once per new refusal: the first one, or one with a changed reason. A transient refusal carries `final: false` (the sweep retries it), a definite one carries `final: true`, and a retry that fails the same way emits nothing.

## Key elements
- `setupTestDb()` – sets up the test database.
- `beforeEach` – calls `registerCheckoutModules([paymentsModule])`.
- `afterEach` – calls `resetDomainEvents()`.
- `paidOrder()` – helper. Creates a user, a product (price `50.00`) and an order of 2 items, pays it by card, and settles the outbox nudges. It looks up the payment by order id and returns `{ orderId, failWith }`. `failWith(reason)` calls `setFakeRefundFailure` with the payment's `providerRef`, so refunds fail with that reason. Passing `undefined` is allowed by its type.
- `failedEvents()` – helper. Returns the payloads of all `payment.refund_failed` outbox rows, oldest first.
- Test 1: a definite refusal (`declined`) on a `30.00` admin refund yields one event with `orderId`, `amount`, `currency: 'EUR'`, `failureReason: 'declined'` and `final: true`.
- Test 2: runs with `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'`.
  - A `provider_unavailable` refusal followed by `retryOpenRefunds()` gives one event with `final: false`.
  - A second `retryOpenRefunds()` with the same failure adds no event, but the test never asserts that step on its own. The assertion appears only after the next step.
  - Switching the failure to `lost_or_stolen_card` and retrying adds a second event with `final: true`.

## Relationships
- `scenarios/support/doubles/payments/fake.ts`: provides `setFakeRefundFailure`, the lever that makes the fake provider refuse refunds.
- `src/modules/payments/services/index.ts`: provides `paymentService`, which the test uses to run the retry sweep.
- `src/modules/payments/tests/factories.ts`: `payByCard` and `refundOrderPayment` drive the payment and refund flows.
- `src/modules/payments/repository.ts`: provides `paymentRepository`, used to find the payment and its `providerRef`.
- `src/modules/payments/events.ts`: supplies the `PAYMENT_REFUND_FAILED` event name.
- `src/modules/payments/module.ts`: the module registered for the test.
- `src/kernel/outbox.ts`: `outboxEventModel` is read for emitted events, and `settleOutboxNudges` flushes pending outbox work.
- `src/kernel/events.ts`: `resetDomainEvents` clears events between tests.
- `src/modules/users/tests/factories.ts`, `src/modules/products/tests/factories.ts`, `src/modules/orders/tests/factories.ts`: build the user, product and order fixtures.
- `tests/support/callers.ts`: `asAdmin` and `callerContextAs('admin')` provide the admin caller.
- `tests/support/checkout-modules.ts`: `registerCheckoutModules`.
- `tests/support/environment.ts`: `withEnvironmentOverrides`.
- `src/types/index.ts`: the `RefundFailureReason` type.

## Notes
- The second test sets `NODE_PAYMENT_REFUND_RETRY_MINUTES` to `'0'` so that open refunds are retried immediately.
- The module doc says the first refusal of a refund is announced. In test 2 the first `retryOpenRefunds()` is followed by the first assertion, which expects exactly one event.
- Events are read from the persisted outbox, not from in-memory domain events.
