---
source: src/modules/payments/tests/integration/refund-reversal.test.ts
sha256: d6ce7a9a5efc481f1d596365ee10a042c83e65970faa039616b0355bc1a5b175
generated_at: 2026-10-29T05:19:45.174671+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-reversal.test.ts

## Purpose

Integration test verifying the lifecycle of a refund that the provider later reports as failed (a "reversal"). It asserts that a settled refund re-opens as owed exactly once, an open refund is permanently failed, redeliveries and late success reports are no-ops, the retry sweep never re-sends a reversed refund, a manual settle re-announces the refund, and a webhook that arrives before `refund()` resolves fails the open record for good. Runs against real Mongo with the fake provider's late-failure lever.

## Key elements

- **`settledRefund(amount?)`** — Builds a 100.00 card payment (product at 50 × 2), settles a refund of `amount` (default 30), and returns `{ orderId, payment, refundId, refundRef, providerRef }`.
- **`deliver(providerRef, refundRef)`** — Shorthand for `paymentService.applyWebhookDelivery` with the `'fake'` provider tag.
- **`stampOf(orderId)`** — Reads the order's `paymentStatus` via `orderService.getById`.
- **`events(name)`** — Counts outbox rows for a given event constant.
- **`describe('a settled refund the provider takes back')`** — Five tests: re-open status/timeline/event/attention; partial stamp preserved when another refund stands; idempotent redelivery + late success ignored; sweep never re-sends; hand-settle re-announces then no-ops a late redelivery.
- **`describe('a webhook that beats refund()')`** — One test: a failure webhook delivered inside the spied `fakePaymentProvider.refund` response fails the still-open record; the late success settles nothing.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — Source of `fakePaymentProvider`, `refundRefOfRecord`, `setFakeLateRefundFailure`, `setFakeRefundOutcome`; the fake's `refund` method is spied in the race-condition test.
- **`src/modules/payments/services/index.ts`** — `paymentService` is the SUT: `applyWebhookDelivery`, `getForOrder`, `listAttention`, `settleRefundByHand`, `retryOpenRefunds`.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` for post-condition assertions on the `refunds` array.
- **`src/modules/payments/events.ts`** — Event-name constants (`PAYMENT_REFUNDED`, `PAYMENT_REFUND_FAILED`, `PAYMENT_REFUND_REVERSED`) used with the outbox counter.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes queued domain events so `events()` sees them; `outboxEventModel` is the Mongoose model used for counting.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` clears the in-memory event bus.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/services/index.ts`** — `orderService.getById` reads the `paymentStatus` stamp written by the payments module.
- **`src/modules/orders/tests/factories.ts`**, **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`** — Domain object creation for the test fixture.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` and `refundOrderPayment` drive the initial payment and refund creation.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules([paymentsModule])` wires the payments module into the module registry each test.
- **`tests/support/callers.ts`** — `asAdmin` / `callerContextAs` supply the auth context for service calls.

## Notes

- **Real Mongo** via `setupTestDb()`; no in-memory substitutes for the repository or outbox.
- The "never sent again" test overrides `NODE_PAYMENT_REFUND_RETRY_MINUTES=0` through `withEnvironmentOverrides` so the sweep would fire immediately if a bug existed.
- The race-condition test injects the webhook *inside* the spied `fakePaymentProvider.refund` promise, so the failure report lands before the service's own `refund()` call resolves — this is the only test that spies on the fake's method directly.
- `jest.restoreAllMocks()` runs in `afterEach`; the sweep test also calls `.mockClear()` on the spied methods to isolate call counts.
- The hand-settle test expects `PAYMENT_REFUNDED` count of **2** (original settle + re-announcement) while `PAYMENT_REFUND_REVERSED` stays at **1**, confirming the reversal event is emitted only once.
