---
source: src/modules/payments/tests/integration/cancelled.test.ts
sha256: 9b277b8f8760d412862777e04e13aedb11a98718d8bebcc6721bb1e3e5e9d8bc
generated_at: 2026-10-29T05:15:51.378015+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/cancelled.test.ts

## Purpose
Integration tests for the lifecycle of a payment whose order has been cancelled. Verifies that the payment transitions to `cancelled` only after the provider confirms the intent is closed, that late provider reports (processing, declined, or a belated success) are handled correctly (no-op, or refund-in-full with idempotency), and that the retention reaper purges old cancelled payments while preserving succeeded ones.

## Key elements
- **`cancelledOrder()`** — Shared setup: creates a user, product, and order; calls `paymentService.createIntent`; cancels the order via `orderService.cancelOnRequestById`; flushes the outbox with `settleOutboxNudges`. Returns `{ user, orderId, providerRef }`.
- **`statusOf` / `refundCountOf` / `providerRefOf` / `orderStatusOf`** — Small read-back helpers that query the payment repository or order service by order ID.
- **`describe('cancelling an order with an open intent')`** — Three cases: successful provider close writes `cancelled`; a payment that never reached the provider still becomes `cancelled`; a provider `cancel` rejection leaves the payment in its prior status.
- **`describe('a late report on a cancelled payment')`** — Uses `setFakeOutcome` + `applyWebhookSettlement` to simulate webhook arrivals. Covers: processing/declined are ignored (no status change, no `PAYMENT_FAILED` in outbox); buyer sync still returns `cancelled`; a late `confirm` flips status to `succeeded` and auto-records one full refund (display `refunded`); a redelivered success is a no-op (refund count stays 1); reconciliation sweep skips the payment.
- **`describe('the retention reaper')`** — Calls `paymentRepository.deleteAbandonedBefore` with a future date; asserts the cancelled payment is deleted while a `succeeded` payment is kept.

## Relationships
- **`scenarios/support/doubles/payments/fake.ts`** — Provides `fakePaymentProvider` (spied on to simulate cancel rejection; called directly to `confirm` a success) and `setFakeOutcome` (sets a provider-side result read by the next webhook settlement).
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` clears accumulated domain-event state between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes the outbox so the `order.cancelled` → payment-listener pipeline actually runs; `outboxEventModel` is queried to assert no `PAYMENT_FAILED` events were emitted.
- **`src/modules/orders/index.ts`** — `orderService.cancelOnRequestById` triggers the cancellation flow; `orderService.getById` reads back order status.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` build the order fixture.
- **`src/modules/payments/events.ts`** — `PAYMENT_FAILED` event name used in outbox count assertions.
- **`src/modules/payments/model.ts`** — `paymentModel.create` for direct insertion (the "never reached provider" case); `paymentModel.exists` in the reaper test.
- **`src/modules/payments/module.ts`** — Registered via `registerCheckoutModules` in `beforeEach` so the payments module's listeners and routes are active.
- **`src/modules/payments/presenter.ts`** — `presentPayment` maps internal status to `displayStatus` for user-facing assertions.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` for reads; `deleteAbandonedBefore` for the retention test.
- **`src/modules/payments/services/index.ts`** — `paymentService.createIntent`, `applyWebhookSettlement`, `syncPayment`, `reconcileStalePayments` are the application entry points exercised by the tests.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the item to purchase.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds buyer fixtures.
- **`tests/support/callers.ts`** — `asCustomer` and `testCallerContext` supply authenticated caller identity to service calls.

## Notes
- **Outbox is the async bridge.** The `order.cancelled` domain event does *not* trigger the payment-listener inline; it is queued in the outbox. Every test that cancels an order must call `settleOutboxNudges()` before asserting on payment status. Forgetting this is the most common way to get a false failure.
- **Provider cancel failure is tested by mocking, not by outcome.** `jest.spyOn(fakePaymentProvider, 'cancel').mockRejectedValueOnce` simulates a provider-side rejection; the application must leave the payment untouched.
- **Idempotency of the late-success refund** is verified by calling `applyWebhookSettlement` twice and asserting `refunds.length === 1`.
- **The reaper test uses a future date** (`Date.now() + 60_000`) for both cutoff arguments of `deleteAbandonedBefore` so that all test data falls within the "abandoned" window, avoiding dependence on wall-clock age.
- **`withEnvironmentOverrides`** temporarily sets `NODE_PAYMENT_RECONCILE_MINUTES` to `'0'` so `reconcileStalePayments` actually scans within the same tick rather than being gated by a time threshold.
