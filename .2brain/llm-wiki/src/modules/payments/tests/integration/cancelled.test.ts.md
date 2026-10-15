---
source: src/modules/payments/tests/integration/cancelled.test.ts
sha256: 7b6187c150f2ba20dcaf43c1925d65e198914030ae3336bea77153910369793a
generated_at: 2026-10-15T11:33:35.390814+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/cancelled.test.ts

## Purpose

Integration tests for the `cancelled` payment state. Verifies that a payment only transitions to `cancelled` after the payment provider confirms the intent is closed, and that late provider reports (webhook settlement, buyer-initiated sync, reconciliation sweep) are safely ignored or fully refunded once the payment is already cancelled.

## Key elements

- **`cancelledOrder()`** — Shared fixture: creates a user, product, order, and a card intent; cancels the order via `orderService.cancelById`; calls `settleOutboxNudges()` to deliver the `order.cancelled` event to the payment listener. Returns `{ user, orderId, providerRef }`.
- **`statusOf`, `refundCountOf`, `providerRefOf`, `orderStatusOf`** — Thin read-back helpers that query `paymentRepository` / `orderService` by order ID.
- **`describe('cancelling an order with an open intent')`** — Three tests covering: provider-confirmed cancel → `cancelled`; payment that never reached the provider → `cancelled`; provider `cancel()` rejects → status stays `requires_confirmation`.
- **`describe('a late report on a cancelled payment')`** — Uses `setFakeOutcome` / `fakePaymentProvider.confirm` to simulate post-cancellation provider events. Asserts that `processing`/`declined` webhooks are no-ops, buyer sync returns `cancelled` without re-reading the provider, a `succeeded` webhook records a full refund, redelivered success is idempotent (one refund), and `reconcileStalePayments` skips the row.
- **`describe('the retention reaper')`** — Verifies `paymentRepository.deleteAbandonedBefore` removes old cancelled payments while preserving old succeeded ones.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` and `setFakeOutcome` drive all provider-side simulation (cancel rejection, late confirm, outcome setting).
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes the `order.cancelled` domain event so the payment listener fires asynchronously; `outboxEventModel.countDocuments` asserts no `PAYMENT_FAILED` event was emitted.
- **`src/kernel/events.ts`** — `resetDomainEvents()` runs in `afterEach` to clear the in-memory event bus between tests.
- **`src/modules/orders/index.ts`** — `orderService.cancelById` triggers the cancellation flow under test.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` build the order fixture.
- **`src/modules/payments/services/index.ts`** (re-exports from **`intent.ts`** and **`settlement.ts`**) — `createIntent`, `applyWebhookSettlement`, `syncPayment`, `reconcileStalePayments` are the entry points exercised by the tests.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` and `.deleteAbandonedBefore` for reads and the retention-reaper test.
- **`src/modules/payments/model.ts`** — `paymentModel.create` used directly in two tests to seed a payment without an intent.
- **`src/modules/payments/presenter.ts`** — `presentPayment` to assert the display-facing status (`cancelled`, `refunded`).
- **`src/modules/payments/events.ts`** — `PAYMENT_FAILED` constant used in the outbox count assertion.
- **`src/modules/payments/module.ts`** — Registered in `beforeEach` via `registerCheckoutModules` so the payment event listeners are active.

## Notes

- The `order.cancelled` event reaches the payment listener **through the outbox**, not inline. Every test that cancels an order must call `settleOutboxNudges()` before asserting payment state; forgetting this is the most common source of false failures.
- `setFakeOutcome` simulates a *late* provider report (i.e., the provider sends a status the app didn't ask for). It is deliberately distinct from the normal `createIntent → confirm` flow.
- The reconciliation test uses `withEnvironment('NODE_PAYMENT_RECONCILE_MINUTES', '0', …)` to force the stale-payment sweep to run immediately rather than waiting for the configured interval.
- Idempotency of the refund-on-late-success path is tested explicitly: calling `applyWebhookSettlement` twice for the same `providerRef` must produce exactly one refund record.
