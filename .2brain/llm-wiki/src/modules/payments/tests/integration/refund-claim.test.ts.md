---
source: src/modules/payments/tests/integration/refund-claim.test.ts
sha256: cc389b5131631328473a789557e0b61600ac485b650ae5732908d811d57a9be0
generated_at: 2026-11-08T07:34:35.291091+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-claim.test.ts

## Purpose

Integration tests (against a real MongoDB instance) for the refund-claim lifecycle: a conditional write with a fence token guarantees only one worker claims a refund, a definite refusal is terminal, a retryable refusal backs off with a growing delay, a deregistered provider is marked `provider_removed` without further attempts, and a provider-side timeout is settled from the provider side rather than double-paid.

## Key elements

- **`paidOrder`** – Creates a user, a product (50.00 × 2), an order, pays by card, and settles outbox nudges. Returns the order ID.
- **`paymentOf` / `firstRefund`** – Convenience lookups via `paymentRepository.findByOrderId` and `paymentModel`.
- **`refund`** – Calls `refundOrderPayment` as an admin caller; rejects on provider refusal.
- **`setRefundField`** – Rewrites one field of the first embedded refund via a raw `paymentModel.collection.updateOne`, forcing `updatedAt` to epoch-zero so staleness checks are deterministic.
- **`describe('a definite refusal')`** – Verifies a `lost_or_stolen_card` reason records `status: 'failed'`, clears `nextAttemptAt`, and that `retryOpenRefunds` never re-sends.
- **`describe('a retryable refusal')`** – Verifies the sweep skips a future `nextAttemptAt` (returns 0) and retries once it is in the past (returns 1, status → `succeeded`).
- **`describe('a pending record')`** – Three tests:
  - Stale-vs-fresh `attemptedAt` gating under `NODE_PAYMENT_REFUND_RETRY_MINUTES=1`.
  - Two concurrent `claimRefund` calls: exactly one wins.
  - A `failRefund`/`settleRefund` carrying a superseded attempt timestamp is a no-op (fence-token protection).
- **`describe('a provider that is no longer registered')`** – A payment whose `provider` no longer matches any registered one is marked `provider_removed` after two sweeps; the reconcile sweep still processes other payments normally.
- **`describe('a refund the provider ran but never answered')`** – With `setFakeRefundTimeout`, the sweep settles the refund as `succeeded` without issuing a second provider call; a forgotten key is adopted, not re-issued.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/doubles/payments/fake.ts` | Provides `fakePaymentProvider`, `setFakeRefundFailure`, `setFakeRefundTimeout`, `fakeRefundsMade`; spied on to verify call counts. |
| `src/modules/payments/services/index.ts` | `paymentService.retryOpenRefunds` and `paymentService.reconcileStalePayments` are the system under test. |
| `src/modules/payments/repository.ts` | `paymentRepository.findByOrderId`, `claimRefund`, `failRefund`, `settleRefund` — the conditional-write API under test. |
| `src/modules/payments/model.ts` | `paymentModel.collection` used for raw Mongo updates that bypass Mongoose timestamps. |
| `src/modules/payments/module.ts` | Registered via `registerCheckoutModules([paymentsModule])` in `beforeEach`. |
| `src/modules/payments/tests/factories.ts` | `payByCard`, `refundOrderPayment` set up the initial payment and trigger the refund. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` flushes deferred outbox entries after payment. |
| `src/kernel/events.ts` | `resetDomainEvents` in `afterEach` prevents event leakage. |
| `tests/support/environment.ts` | `withEnvironmentOverrides` scopes `NODE_PAYMENT_*` retry knobs per-test without mutating global state. |
| `tests/support/callers.ts` | `asAdmin`, `callerContextAs('admin')` build the authorization context for refund calls. |
| `tests/support/setup-test-db.ts` | `setupTestDb` spins up and tears down the real Mongo instance. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` wires module DI for the test. |
| `src/modules/users/tests/factories.ts` | `createUser` seeds the buyer. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds the line-item. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` seed the order and its items. |

## Notes

- **Real Mongo, no in-memory DB.** `setupTestDb` boots a standalone instance; all reads/writes hit the wire. This is what makes the concurrent-claim and fence-token tests meaningful.
- **`setRefundField` sets `updatedAt: new Date(0)`.** This is intentional: the sweep's staleness check compares against `updatedAt`, and forcing it to epoch-zero ensures the record is never considered "fresh" by accident. Any new test that needs a "stale" record should follow the same pattern.
- **`withEnvironmentOverrides` is the only way to control retry timing.** Tests that omit it will use production defaults and may sleep for minutes. Always wrap the relevant assertion in this helper.
- **Fence-token semantics:** `claimRefund` uses a conditional `findOneAndUpdate` with an `attempt` timestamp. `failRefund`/`settleRefund` carry the same timestamp back; if a newer claim has already advanced the record, both return `null` and the state is unchanged. Tests assert this by checking that the refund status remains `pending`.
- **`NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'`** means "no minimum retry delay," so the sweep fires immediately. Use `'1'` (or higher) when you need to test the wait-out window.
