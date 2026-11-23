---
source: src/modules/payments/tests/integration/refund-settle-card.test.ts
generated_at: 2026-11-22T07:00:59.455324+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refund-settle-card.test.ts

## Purpose
Integration test (real Mongo, through the public `paymentService` API) for the operator action "mark a REFUSED card refund as returned by hand". It checks that only a refusal proving the money did not move can be settled, that unclear or in-flight refunds answer 409, that a settled refund is never sent to the provider again, and how such refunds appear in the attention list.

## Key elements
- `refusedRefund(reason)` — helper that creates a user, product (50.00 × 2) and order, pays by card, settles outbox nudges, makes the fake provider refuse a 30.00 refund with the given `RefundFailureReason`, and returns `{ orderId, payment, refundId }`.
- `settle(paymentId, refundId)` — wraps `paymentService.settleRefundByHand` as admin.
- `describe.each` over `declined`, `insufficient_funds`, `expired_or_canceled_card`, `lost_or_stolen_card` — settling succeeds, the refund becomes `succeeded` with `settledByHand: true`, `actions.settleRefundByHand` lists the refund id, exactly one `PAYMENT_REFUNDED` outbox event exists, and `retryOpenRefunds()` does not call `fakePaymentProvider.refund`.
- `describe.each` over `provider_unavailable` and `unknown` — no settle action is offered; settling answers 409 `PAYMENT_REFUND_IN_FLIGHT`, and the refund stays `failed`.
- "attempt is running" tests — a refund claimed via `paymentRepository.claimRefund` (status `pending`) answers 409 `PAYMENT_REFUND_IN_FLIGHT`. A second test spies on `settleRefund` to inject a claim between the read and the write, and expects the same 409 and a `pending` status.
- "what needs attention" tests on `paymentService.listAttention()`:
  - a final refusal is listed at once as `refused_refund`;
  - a retryable refusal is listed as `stale_refund` only after about 3 hours, and an old final refusal appears only once, as `refused_refund`;
  - a refused refund tied to a return carries `refundDueBy` and `refundDueRule`;
  - one with no return has no deadline but has `since`.

## Relationships
- Uses `fakePaymentProvider`, `setFakeRefundFailure` from `scenarios/support/doubles/payments/fake.ts` to force refusals and to spy on `refund`.
- Uses `paymentRepository` (`claimRefund`, `settleRefund`, `findByOrderId`) from `repository.ts`, `paymentModel` from `model.ts` (its `collection` is used directly to backdate `createdAt` and set `returnId`/`dueBy`/`dueRule`), `PAYMENT_REFUNDED` from `events.ts`, and `paymentsModule` from `module.ts`.
- Calls `paymentService` through `src/modules/payments/services/index.ts` (`settleRefundByHand`, `getForOrder`, `retryOpenRefunds`, `listAttention`).
- Uses `resetDomainEvents` from `src/kernel/events.ts` and `outboxEventModel`/`settleOutboxNudges` from `src/kernel/outbox.ts` to flush and count events.
- Uses the user, product and order factories (`src/modules/users|products|orders/tests/factories.ts`) and the payments factories (`payByCard`, `refundOrderPayment`) for setup.
- Uses `tests/support/callers.ts` (`asAdmin`, `callerContextAs`) and `tests/support/checkout-modules.ts` (`registerCheckoutModules`). It also uses `setupTestDb`, `withEnvironmentOverrides` and `asReject`.
- Imports the `RefundFailureReason` type from `src/types/index.ts`.

## Notes
- Several tests set `NODE_PAYMENT_REFUND_RETRY_MINUTES` to `'0'` through `withEnvironmentOverrides`.
- `beforeEach` registers only `paymentsModule` via `registerCheckoutModules`; `afterEach` resets domain events and restores jest mocks.
- The race test wraps the real `settleRefund` and runs `claimRefund` first, simulating a claim between the service's read and its write.
