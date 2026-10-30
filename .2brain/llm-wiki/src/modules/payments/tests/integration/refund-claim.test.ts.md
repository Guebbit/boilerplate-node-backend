---
source: src/modules/payments/tests/integration/refund-claim.test.ts
sha256: ef595f4a8d4d92425e5e4e972b605a29e856bd5b04423db8b96470e7ce6d8b70
generated_at: 2026-10-29T05:18:38.907418+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-claim.test.ts

## Purpose

Integration tests for the refund-claim lifecycle against a real Mongo database. Verifies the full state machine: a conditional write claims a refund, a fence token prevents a stale attempt from overwriting a newer one, definite refusals are terminal, retryable refusals respect a growing delay, a removed provider ends the refund cleanly, and a provider timeout results in settlement rather than a duplicate charge.

## Key elements

- **`paidOrder()`** – Creates a user, product, and 2-item order, then pays by card; returns the `orderId`.
- **`paymentOf(orderId)`** – Loads the payment via `paymentRepository.findByOrderId`; throws if absent.
- **`firstRefund(orderId)`** – Shortcut to the first entry in the payment's `refunds` array.
- **`refund(orderId, amount)`** – Calls `refundOrderPayment` with an admin caller context.
- **`setRefundField(paymentId, field, value)`** – Directly `$set`s a field on `refunds.0.<field>` in Mongo, resetting `updatedAt` to epoch to bypass any staleness guard.
- **`describe` blocks** – "a definite refusal", "a retryable refusal", "a pending record" (incl. concurrent-claim and superseded-attempt cases), "a provider that is no longer registered", "a refund the provider ran but never answered".

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/doubles/payments/fake.ts` | Supplies `fakePaymentProvider` (spied on), `setFakeRefundFailure`, `setFakeRefundTimeout`, `ageFakeRefundKeys`, `fakeRefundsMade`. |
| `src/modules/payments/services/index.ts` | `paymentService.retryOpenRefunds()` and `.reconcileStalePayments()` are the SUT actions under test. |
| `src/modules/payments/repository.ts` | `paymentRepository.claimRefund`, `.failRefund`, `.settleRefund` are exercised directly for fence-token and conditional-write assertions. |
| `src/modules/payments/model.ts` | `paymentModel.collection` used for raw Mongo updates (status, timestamps, provider) to simulate time passage and provider removal. |
| `src/modules/payments/tests/factories.ts` | `payByCard`, `refundOrderPayment` build the initial paid state and trigger the refund endpoint. |
| `src/modules/payments/module.ts` | Registered via `registerCheckoutModules` in `beforeEach`. |
| `src/kernel/events.ts` / `src/kernel/outbox.ts` | `resetDomainEvents` and `settleOutboxNudges` in cleanup / setup. |
| `src/modules/orders/tests/factories.ts`, `src/modules/products/tests/factories.ts`, `src/modules/users/tests/factories.ts` | Domain-entity factories used to build the paid-order fixture. |
| `tests/support/environment.ts` | `withEnvironmentOverrides` toggles `NODE_PAYMENT_REFUND_RETRY_MINUTES` / `NODE_PAYMENT_RECONCILE_MINUTES` to zero for deterministic timing. |
| `tests/support/callers.ts` | `asAdmin`, `callerContextAs` construct the operator identity for refund calls. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` wires the payments module into the test app. |
| `tests/support/setup-test-db.ts` | `setupTestDb` provisions a real Mongo instance for the suite. |

## Notes

- **Real Mongo, not in-memory.** `setupTestDb()` spins up a genuine database; tests rely on MongoDB's atomic `$set` semantics for the conditional-write and fence-token assertions.
- **Timestamp bypass.** `setRefundField` forces `updatedAt` to `new Date(0)` so that staleness checks (which compare `updatedAt` against a `staleBefore` window) behave predictably regardless of test execution speed.
- **Environment overrides are per-test.** Each `it` that needs a specific retry delay wraps its body in `withEnvironmentOverrides`; the override is scoped to that single test and reverted after.
- **Concurrency test.** The "lets only one of two claims through" case fires two `claimRefund` calls via `Promise.all` and asserts exactly one succeeds—this validates the conditional-write guard end-to-end against real Mongo.
- **Spy pattern.** `jest.spyOn(fakePaymentProvider, 'refund')` is cleared before each sweep assertion to prove the sweep did *not* re-send a call that should be terminal.
