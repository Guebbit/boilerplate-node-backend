---
source: src/modules/payments/tests/integration/refund-claim.test.ts
source_sha256: cc389b5131631328473a789557e0b61600ac485b650ae5732908d811d57a9be0
context_sha256: 6c8e73c8d32ca5a7d00b316755111fbe78c2e48bbd171436c06fd5b0c40b8b6e
generated_at: 2026-11-22T06:59:10.340710+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refund-claim.test.ts

## Purpose
Integration tests (real Mongo) for the claim step that precedes sending a refund to a payment provider. They verify that a single conditional write claims a refund record, that a fence token (the attempt timestamp) stops a slow old attempt from overwriting a newer one, that definite refusals are never resent, that retryable failures wait out a delay, that a removed provider ends a refund rather than jamming the sweep, and that a provider that forgot an idempotency key cannot cause a second refund.

## Key elements
- `setupTestDb()` and a `beforeEach` that calls `registerCheckoutModules([paymentsModule])`; `afterEach` resets domain events and restores jest mocks.
- `paidOrder()` — creates a user, a 50.00 product and an order of 2 items, pays by card, settles outbox nudges, and returns `{ orderId }` (a 100.00 payment).
- `paymentOf(orderId)` / `firstRefund(orderId)` — load the payment via `paymentRepository.findByOrderId` (throws if missing) or its first refund.
- `refund(orderId, amount)` — refunds as an admin operator through `refundOrderPayment`; a provider refusal rejects while the record stays open.
- `setRefundField(paymentId, field, value)` — writes `refunds.0.<field>` directly through `paymentModel.collection`, bypassing mongoose timestamps and resetting `updatedAt` to epoch.
- Test groups:
  - **a definite refusal** — `setFakeRefundFailure(..., 'lost_or_stolen_card')` leaves the refund `failed` with no `nextAttemptAt`; `retryOpenRefunds` does not call the provider again.
  - **a retryable refusal** — skipped while `nextAttemptAt` is in the future (sweep returns 0), resent once it is past (returns 1, status `succeeded`).
  - **a pending record** — resent once its attempt is stale, skipped while fresh; two concurrent `paymentRepository.claimRefund` calls yield exactly one winner; `failRefund` and `settleRefund` with an old `attempt` return `null` after a newer claim, leaving the refund `pending`.
  - **a provider that is no longer registered** — the refund ends as `failed` / `provider_removed` without calling the provider (the test expects `attempts: 2` after two sweeps); `reconcileStalePayments` still returns 0 for a `processing` payment at the `retired` provider rather than being blocked.
  - **a refund the provider ran but never answered** — using `setFakeRefundTimeout`, the first attempt records `provider_unavailable`. The sweep settles the refund from the provider (status `succeeded`) with only one refund made (`fakeRefundsMade()`). A following test about the provider forgetting the key (`ageFakeRefundKeys` is imported for it) is cut off in the visible content.

## Relationships
- `scenarios/support/doubles/payments/fake.ts` — supplies `fakePaymentProvider` and controls (`setFakeRefundFailure`, `setFakeRefundTimeout`, `fakeRefundsMade`, `ageFakeRefundKeys`).
- `src/modules/payments/services/index.ts` — exports `paymentService`, whose sweeps (`retryOpenRefunds`, `reconcileStalePayments`) are the code under test.
- `src/modules/payments/repository.ts` — `findByOrderId`, `claimRefund`, `failRefund`, `settleRefund`.
- `src/modules/payments/model.ts` — exports `paymentModel`, whose `collection` is used for raw writes.
- `src/modules/payments/module.ts` — registered through `tests/support/checkout-modules.ts`.
- `src/modules/payments/tests/factories.ts` — `payByCard`, `refundOrderPayment`.
- `src/modules/users/tests/factories.ts`, `src/modules/products/tests/factories.ts` and `src/modules/orders/tests/factories.ts` — build the paid order fixture.
- `src/kernel/events.ts` (`resetDomainEvents`) and `src/kernel/outbox.ts` (`settleOutboxNudges`) — test isolation and draining the outbox.
- `tests/support/setup-test-db.ts` (database), `tests/support/environment.ts` (`withEnvironmentOverrides`), `tests/support/callers.ts` (`asAdmin`, `callerContextAs`).

## Notes
- The sweep timing is controlled with the env overrides `NODE_PAYMENT_REFUND_RETRY_MINUTES` (`'0'` or `'1'`) and `NODE_PAYMENT_RECONCILE_MINUTES`.
- Stale or retryable states are staged by writing directly to the collection (`nextAttemptAt`, `attemptedAt`, `status`, `updatedAt`) instead of waiting in real time.
- Failures are produced either by the fake provider's controls or with `jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(...)`; `mockClear()` on a fresh spy is used to assert that no further provider calls happen.
