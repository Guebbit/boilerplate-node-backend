---
source: src/modules/payments/tests/integration/refund-reversal.test.ts
sha256: 296d3cf73bb6f8004e4844f34d70ac07ce8a90396860ccaef2997b239601920d
generated_at: 2026-11-14T21:16:56.649425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-reversal.test.ts

## Purpose
Integration tests (real Mongo) for the provider-reported refund failure path: a refund that had already settled and then bounces back (a *reversal*), and a refund that fails before it ever settles (a *refusal*). Verifies status transitions, the single `PAYMENT_REFUND_REVERSED` / `PAYMENT_REFUND_FAILED` event, idempotency of webhook redeliveries, exclusion from the retry sweep, and the manual "settle by hand" escape hatch.

## Key elements
- **`settledRefund(amount)`** – Creates user → product → order → card payment → settled refund in one shot; returns `orderId`, `payment`, `refundId`, `refundRef`, `providerRef`.
- **`deliverRefund(providerRef, refundRef)`** – Thin wrapper around `deliver()` to fire one provider webhook event.
- **`stampOf(orderId)`** – Reads `order.paymentStatus` via `orderService`.
- **`events(name)`** – Counts outbox rows for a given event name.
- **`describe('a settled refund the provider takes back')`** – Five tests covering: reversal state + single event + attention item; partial stamp preserved when another refund stands; redelivery and late-success no-ops; exclusion from `retryOpenRefunds` sweep; manual settle-by-hand followed by a no-op redelivery.
- **`describe('a webhook that beats refund()')`** – Race-condition test where the provider webhook for the failure is delivered *inside* the `refund()` call before the provider's own success response returns; asserts the record is marked `failed` (not reversed), `PAYMENT_REFUND_FAILED` emitted once, `reversedAfterSettling` asserted via `toBeUndefined()`, and redelivery is a no-op.

## Relationships
- **`scenarios/support/doubles/payments/fake.ts`** – Source of `fakePaymentProvider`, `refundRefOfRecord`, `setFakeLateRefundFailure`, `setFakeRefundOutcome`; the "late-failure lever" and outcome override used throughout.
- **`src/modules/payments/services/index.ts`** – `paymentService` provides `retryOpenRefunds`, `settleRefundByHand`, `getForOrder`, `listAttention`.
- **`src/modules/payments/tests/deliver.ts`** – `deliver()` is the webhook-injection entry point.
- **`src/modules/payments/tests/factories.ts`** – `payByCard` and `refundOrderPayment` build the initial payment/refund.
- **`src/modules/payments/events.ts`** – Event name constants asserted in outbox counts.
- **`src/modules/payments/repository.ts`** – Payment repository used for direct state assertions.
- **`src/modules/payments/module.ts`** – Registered in `beforeEach` via `registerCheckoutModules`.
- **`src/modules/orders/index.ts`** – `orderService` used to read the order's `paymentStatus`.
- **`src/modules/orders/services/index.ts`** – Underlying order service implementation.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`** – Entity creation.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes outbox; `outboxEventModel` for event counts.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach`.
- **`tests/support/callers.ts`** – `asAdmin`, `callerContextAs` for auth contexts.

## Notes
- **Reversal vs. refusal distinction:** `reversedAfterSettling: true` means the refund had settled before the provider reported failure; the test asserts `toBeUndefined()` for this field when the refund never settled.
- **Race test mocks the provider:** `fakePaymentProvider.refund` is spied on so the failure webhook fires *inside* the call, before the provider's success response resolves. This exercises the "webhook beats the API response" ordering.
- **Retry-sweep test** uses `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` to force the sweep window to zero, then asserts `refund` and `retrieveRefund` are never called on a reversed/refused record.
- **Idempotency is a first-class concern:** every redelivery (failure or success) after the terminal state must produce zero additional outbox events and zero state change.
