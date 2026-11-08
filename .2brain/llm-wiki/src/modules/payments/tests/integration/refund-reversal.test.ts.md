---
source: src/modules/payments/tests/integration/refund-reversal.test.ts
sha256: 1c21bb5372046f20de5aa8a2df701777b856df76d9efb6f48e44cbd8df75f2f6
generated_at: 2026-11-08T07:35:37.182676+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-reversal.test.ts

## Purpose

Integration tests (against real MongoDB) that verify the full lifecycle when a payment provider reports a refund as failed: a settled refund that bounces is re-opened as owed exactly once, an open refund that never settled is failed for good, and neither case is ever re-sent to the provider or re-announced on redelivery. Also covers the race where the failure webhook arrives before the `refund()` call resolves.

## Key elements

- **`settledRefund(amount?)`** – Full checkout fixture: creates user, product, order; pays by card; issues a refund; returns `orderId`, `payment`, `refundId`, `refundRef`, `providerRef`.
- **`deliver(providerRef, refundRef)`** – Simulates one provider webhook hit through `paymentService.applyWebhookDelivery`.
- **`stampOf(orderId)`** – Reads the order's `paymentStatus` via `orderService`.
- **`events(name)`** – Counts outbox rows for a given event name (asserts exactly-once emission).
- **`describe('a settled refund the provider takes back')`** – 5 tests: re-open as owed (status, stamp, timeline, single `PAYMENT_REFUND_REVERSED`, attention entry); partial stamp preserved when a second refund stands; idempotency under redelivery + late success; sweep never re-sends; hand-settle closes it and re-announces, subsequent redelivery is a no-op.
- **`describe('a webhook that beats refund()')`** – 1 test: mocks `fakePaymentProvider.refund` to inject the failure webhook mid-flight; asserts `failed` status, `PAYMENT_REFUND_FAILED` (not `REVERSED`), `reversedAfterSettling` is undefined, attention kind is `refused_refund`, and redelivery is inert.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Source of `fakePaymentProvider`, `refundRefOfRecord`, `setFakeLateRefundFailure`, `setFakeRefundOutcome`; the "late-failure lever" that drives every scenario here.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach`.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` (processes pending outbox work) and `outboxEventModel` (counts emitted events).
- **`src/modules/orders/index.ts` / `services/index.ts`** – `orderService.getById` to read the stamped `paymentStatus`.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUNDED`, `PAYMENT_REFUND_FAILED`, `PAYMENT_REFUND_REVERSED` constants for outbox assertions.
- **`src/modules/payments/module.ts`** – Registered in `beforeEach` via `registerCheckoutModules`.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` for direct record assertions.
- **`src/modules/payments/services/index.ts`** – `paymentService` for webhook delivery, `listAttention`, `settleRefundByHand`, `retryOpenRefunds`, `getForOrder`.
- **`src/modules/payments/tests/factories.ts`** – `payByCard`, `refundOrderPayment`.
- **`src/modules/products/tests/factories.ts`** / **`src/modules/users/tests/factories.ts`** – `createProduct`, `createUser`.
- **`tests/support/callers.ts`** – `asAdmin`, `callerContextAs` for auth context.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` wiring.

## Notes

- Uses **real MongoDB** (`setupTestDb`), not an in-memory stub; this is an integration test, not a unit test.
- Event assertions rely on `outboxEventModel.countDocuments` after `settleOutboxNudges`—always flush the outbox before counting.
- The sweep test uses `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` to force the retry window to zero so `retryOpenRefunds` actually runs; without this the interval guard would skip the sweep.
- In the race-condition test, `fakePaymentProvider.refund` is spied and its implementation is replaced to call `deliver` *before* resolving—this is the only place the provider double is monkey-patched mid-call.
- `reversedAfterSettling` is the discriminator: `true` means the refund settled then bounced (reversal); `undefined` means it never settled (refusal). Tests assert this explicitly.
