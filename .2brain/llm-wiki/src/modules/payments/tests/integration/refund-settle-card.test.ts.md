---
source: src/modules/payments/tests/integration/refund-settle-card.test.ts
sha256: 22d75db567e2815f2c6098d97f090371ca21594bc3c64b6447bf785bde18350f
generated_at: 2026-11-08T07:35:54.719591+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-settle-card.test.ts

## Purpose

Integration test for the operator's "settle by hand" action on a refused card refund. Verifies the full decision matrix: definitive refusals may be settled (one-time, not re-sent to the provider), unclear or in-flight refusals are rejected with 409, and the attention list surfaces refused refunds correctly. Runs against real Mongo through the services' public API.

## Key elements

- **`refusedRefund(reason)`** – Scenario builder: creates user → product → order (2 × 50.00) → pays by card → settles outbox → sets the fake provider to fail with the given `RefundFailureReason` → triggers a 30.00 refund. Returns `{ orderId, payment, refundId }`.
- **`settle(paymentId, refundId)`** – Thin wrapper around `paymentService.settleRefundByHand` with admin caller context.
- **`describe.each` (definitive refusals)** – For `declined`, `insufficient_funds`, `expired_or_canceled_card`, `lost_or_stolen_card`: asserts the refund is offered in `actions.settleByHand`, settle succeeds once, status becomes `succeeded` + `settledByHand`, exactly one `PAYMENT_REFUNDED` outbox event is emitted, and `retryOpenRefunds` does not call the provider again.
- **`describe.each` (unclear refusals)** – For `provider_unavailable`, `unknown`: asserts nothing is offered in actions, settle returns 409 `PAYMENT_REFUND_IN_FLIGHT`, and the refund stays `failed` (no write).
- **`describe` (in-flight / pending)** – Two sub-tests: (1) a refund already in `pending` status rejects settle with 409; (2) a race-condition simulation where `claimRefund` fires between the service's read and its `settleRefund` write also yields 409 and leaves the refund `pending`.
- **`describe` ("what needs attention")** – Exercises `paymentService.listAttention()`: definitive refusals appear immediately as `refused_refund`; retryable refusals stay hidden until 3 h old, then appear as `stale_refund`; an old definitive refusal is *not* double-listed; a `returnId`-bearing refusal carries a 14-day `refundDueBy` deadline; a no-return refusal has no deadline, only `since`.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Provides `fakePaymentProvider` and `setFakeRefundFailure`; the test spies on `fakePaymentProvider.refund` to assert no re-send after settlement.
- **`src/modules/payments/services/index.ts`** – Calls `paymentService.settleRefundByHand`, `.getForOrder`, `.retryOpenRefunds`, `.listAttention` (the system under test).
- **`src/modules/payments/repository.ts`** – Reads payment state (`findByOrderId`), simulates claims (`claimRefund`), and is spied on in the race test (`settleRefund`).
- **`src/modules/payments/model.ts`** – Direct Mongo collection writes (`paymentModel.collection.updateOne`) to age refunds or attach a `returnId`.
- **`src/modules/payments/events.ts`** – Asserts outbox event count for `PAYMENT_REFUNDED`.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` flushes pending outbox work; `outboxEventModel` is queried for event counts.
- **`src/kernel/events.ts`** – `resetDomainEvents()` in `afterEach`.
- **`src/modules/payments/tests/factories.ts`** – `payByCard` and `refundOrderPayment` drive the initial payment and refund.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** – Seed the prerequisite user, product, and order.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules([paymentsModule])` in `beforeEach` wires the module into the test app.
- **`tests/support/callers.ts`** – `asAdmin()` and `callerContextAs('admin')` supply the operator identity.
- **`src/types/index.ts`** – `RefundFailureReason` union type parameterises the test matrix.

## Notes

- Uses **real Mongo** (`setupTestDb`), not an in-memory DB — state assertions go through the repository and raw model collection.
- `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'` is overridden per-test via `withEnvironmentOverrides` to eliminate retry timing from the assertions.
- The race-condition test (second sub-test under "in-flight") intercepts `paymentRepository.settleRefund` with `mockImplementationOnce` to inject a `claimRefund` between the service's read and write, simulating a concurrent operator claim.
- `listAttention` age threshold is hard-coded as 3 hours (`3 * 3_600_000`); the 14-day deadline is also a literal, not a constant import.
