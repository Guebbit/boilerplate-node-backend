---
source: src/modules/payments/tests/integration/refund-settle-card.test.ts
sha256: 1a4d7d1e75b0bb41852fa9f66e5a6e318d9ac86ec85b61dca41610ac6a906796
generated_at: 2026-11-14T21:17:34.842944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-settle-card.test.ts

## Purpose

Integration test (real MongoDB) that verifies the operator's "settle refused refund by hand" workflow for card payments. It asserts the core domain rule: only a refund whose refusal proves the money did not move (final reasons) may be settled; an unclear or in-flight attempt returns 409; and once settled, the refund is never re-sent to the provider.

## Key elements

- **`refusedRefund(reason)`** — Scenario helper: creates user, product, 2-item order, pays by card (100.00), settles outbox, then triggers a 30.00 refund that the fake provider refuses with the given `RefundFailureReason`. Returns `{ orderId, payment, refundId }`.
- **`settle(paymentId, refundId)`** — Thin wrapper around `paymentService.settleRefundByHand` with admin caller context.
- **`describe.each` — final refusal reasons** (`declined`, `insufficient_funds`, `expired_or_canceled_card`, `lost_or_stolen_card`): verifies settle succeeds, the action is offered in `getForOrder`, exactly one `PAYMENT_REFUNDED` outbox event fires, and `retryOpenRefunds` does not call the provider again.
- **`describe.each` — unclear reasons** (`provider_unavailable`, `unknown`): verifies 409 / `PAYMENT_REFUND_IN_FLIGHT`, no action offered, refund status stays `failed`.
- **"attempt is running" block**: verifies 409 when refund is `pending`; also simulates a race where a concurrent `claimRefund` lands between the service's read and write (by mocking `settleRefund` to inject a claim mid-call).
- **"what needs attention" block**: verifies `listAttention` classifies final refusals as `refused_refund`, keeps retryable refusals out until the stale threshold (then `stale_refund`), avoids double-listing, and carries `refundDueBy`/`refundDueRule` when a return is attached.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` is spied on to assert no re-sent refund; `setFakeRefundFailure` drives the provider's refusal reason.
- **`src/modules/payments/services/index.ts`** — `paymentService` is the sole public API under test (`settleRefundByHand`, `getForOrder`, `retryOpenRefunds`, `listAttention`).
- **`src/modules/payments/repository.ts`** — `paymentRepository` used to read post-condition state and to call `claimRefund` directly in the race-condition test.
- **`src/modules/payments/model.ts`** — `paymentModel.collection` is mutated directly to backdate `refunds[0].createdAt` and stamp `returnId`/`dueBy`/`dueRule` for the attention-list tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes pending outbox entries; `outboxEventModel` counts emitted events.
- **`src/modules/payments/events.ts`** — `PAYMENT_REFUNDED` name used in the outbox assertion.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the event store between tests.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` and `refundOrderPayment` build the initial payment and trigger the refund call.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` seed the 2-item order.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the product.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds the customer.
- **`tests/support/callers.ts`** — `asAdmin` / `callerContextAs` supply the admin caller identity.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules([paymentsModule])` wires the module graph for each test.
- **`src/modules/payments/module.ts`** — imported and passed to `registerCheckoutModules` so the service layer is fully wired against real Mongo.
- **`src/types/index.ts`** — `RefundFailureReason` union constrains the parameterised refusal reasons.

## Notes

- This is a **true integration test**: `setupTestDb()` provisions real MongoDB; no in-memory stores.
- `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` disables the retry back-off so the suite runs without sleeps.
- The race-condition test does **not** use real concurrency; it intercepts `settleRefund` via `mockImplementationOnce` to inject a `claimRefund` call mid-write, simulating the "lost the race" path.
- The attention-list tests mutate the Mongo collection directly (`paymentModel.collection.updateOne`) to age or annotate a refund — bypassing the service layer on purpose.
- Final vs. unclear refusal reasons are the **only** distinction that gates settlement; the test suite is parameterised over that boundary explicitly.
