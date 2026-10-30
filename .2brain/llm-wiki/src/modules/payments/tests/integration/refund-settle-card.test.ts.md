---
source: src/modules/payments/tests/integration/refund-settle-card.test.ts
sha256: acb8b418d068cb751048ca72a3441ba855f52ed9fab9132d85dcb455b7af2961
generated_at: 2026-10-29T05:20:01.445876+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-settle-card.test.ts

## Purpose

Integration tests for the **settle-refund-by-hand** operator action on card payments. Verifies the full decision matrix: final refusals (declined, insufficient_funds, expired/canceled card, lost/stolen card) may be settled exactly once; unclear or in-flight refusals are rejected with `409 PAYMENT_REFUND_IN_FLIGHT`; and settled refunds are never re-sent to the provider. Also covers the `listAttention` surfacing rules and the 14-day legal deadline attached to refused refunds that pay a return.

## Key elements

- **`refusedRefund(reason)`** — local helper that seeds a user, product, order, card payment (100.00), triggers a 30.00 refund via the fake provider's `setFakeRefundFailure`, and returns `{ orderId, payment, refundId }`.
- **`settle(paymentId, refundId)`** — thin wrapper around `paymentService.settleRefundByHand` with an admin caller context.
- **`describe.each` – final refusal reasons** (`declined`, `insufficient_funds`, `expired_or_canceled_card`, `lost_or_stolen_card`) — asserts: `actions.settleByHand` offers the refund id, settle succeeds, status becomes `succeeded` + `settledByHand: true`, exactly one `PAYMENT_REFUNDED` outbox event is emitted, and `retryOpenRefunds` does not call the provider again.
- **`describe.each` – unclear reasons** (`provider_unavailable`, `unknown`) — asserts `409 PAYMENT_REFUND_IN_FLIGHT`, no action offered, refund status remains `failed`.
- **"attempt is running" block** — simulates a `pending` refund (via `claimRefund`) and a **race** where a concurrent claim lands between the service's read and write (mocked `settleRefund`); both expect `409`.
- **"what needs attention" block** — exercises `paymentService.listAttention` for `refused_refund` vs `stale_refund` kinds, confirms a final refusal is *not* also listed as stale, and checks the `refundDueBy` 14-day deadline (present when a `returnId` exists, absent otherwise).

## Relationships

- **`fake.ts`** — `fakePaymentProvider` and `setFakeRefundFailure` drive the provider-side refusal; `refund` is spied on to prove no re-send after settle.
- **`payments/services/index.ts`** — `paymentService` is the public API under test (`settleRefundByHand`, `getForOrder`, `retryOpenRefunds`, `listAttention`).
- **`payments/repository.ts`** — `findByOrderId`, `claimRefund`, `settleRefund` used for state inspection and race simulation.
- **`payments/model.ts`** — `paymentModel.collection` is updated directly to back-date `createdAt` or set `returnId` for attention-list tests.
- **`payments/events.ts`** — `PAYMENT_REFUNDED` used to count outbox emissions.
- **`kernel/outbox.ts`** — `settleOutboxNudges` flushes outbox before asserting event counts; `outboxEventModel` reads the stored events.
- **`kernel/events.ts`** — `resetDomainEvents` in `afterEach` to isolate domain-event state.
- **`payments/tests/factories.ts`** — `payByCard`, `refundOrderPayment` set up the payment and trigger the refund under test.
- **`orders/tests/factories.ts`**, **`products/tests/factories.ts`**, **`users/tests/factories.ts`** — seed the required aggregate data.
- **`types/index.ts`** — `RefundFailureReason` type constrains the `describe.each` parameter.
- **`tests/support/callers.ts`** — `asAdmin`, `callerContextAs` provide the operator identity.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module into the app per test.
- **`payments/module.ts`** — the module instance passed to `registerCheckoutModules`.

## Notes

- Runs against **real MongoDB** (`setupTestDb`); the file's doc comment explicitly states "Real Mongo, through the services' public door."
- `NODE_PAYMENT_REFUND_RETRY_MINUTES` is overridden to `'0'` in blocks that exercise `retryOpenRefunds`, so the retry window is effectively closed.
- The race-condition test does **not** use a real concurrent request; it spies on `settleRefund` and injects `claimRefund` mid-call to simulate a losing concurrent writer.
- Attention-list age tests mutate `refunds.0.createdAt` directly via `paymentModel.collection.updateOne` (3 hours back) to cross the stale threshold without waiting.
- `jest.restoreAllMocks()` in `afterEach` ensures the `settleRefund` spy does not leak into subsequent tests.
