---
source: src/modules/payments/tests/integration/reconcile.test.ts
sha256: 53f908cd78fdf7c772009d6145d0a2cf1c2c53f7e9a1b5dbf557341e0730491b
generated_at: 2026-10-15T11:34:43.149920+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/reconcile.test.ts

## Purpose

Integration tests for the payment reconciliation sweep and the cancel-when-already-charged path. The scenario being guarded: the PSP successfully charged a card but the "payment.succeeded" webhook never arrived, so the application would otherwise strand money. The tests verify that `reconcileStalePayments` picks up such payments and that cancelling an order still settles correctly when the provider has already closed the intent.

## Key elements

- **`chargedAtProvider`** – Local helper that creates a user, product, order, and payment intent, then calls `fakePaymentProvider.confirm` *without* notifying the application. This is the "lost webhook" setup.
- **`describe('reconcileStalePayments')`** – Three cases: (1) sweep settles a stale payment once the grace window elapses, (2) sweep leaves a payment younger than the window untouched, (3) sweep is idempotent (second call returns 0).
- **`describe('cancelling an order whose intent already succeeded at the provider')`** – Verifies that `orderService.cancelById` succeeds, the outbox delivers the cancel event to the payment listener, and the final state is payment `succeeded` / order `cancelled`.
- **`beforeEach`** – Registers `paymentsModule` via `registerCheckoutModules`.
- **`afterEach`** – Calls `resetDomainEvents()` to clear the kernel event bus between tests.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/doubles/payments/fake.ts` | `fakePaymentProvider.confirm` simulates the PSP confirming a charge without sending a webhook. |
| `src/kernel/events.ts` | `resetDomainEvents` clears the in-process event bus in `afterEach`. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` flushes deferred outbox messages so the cancel listener fires before assertions. |
| `src/modules/orders/index.ts` | `orderService.getById` / `cancelById` drive the order side of the assertions. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the order fixture. |
| `src/modules/products/tests/factories.ts` | `createProduct` builds the product fixture. |
| `src/modules/users/tests/factories.ts` | `createUser` builds the customer fixture. |
| `src/modules/payments/module.ts` | `paymentsModule` is registered so its listeners are active during the test. |
| `src/modules/payments/repository.ts` | `paymentRepository.findByOrderId` reads final payment state. |
| `src/modules/payments/services/index.ts` | `createIntent` (setup) and `reconcileStalePayments` (SUT) are imported. |
| `tests/support/callers.ts` | `asCustomer` produces the caller identity for intent creation and cancel. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` wires modules into the DI container per test. |

## Notes

- **"Lost webhook" modelling** – The fake PSP is confirmed directly; no event is emitted to the application. The reconciliation sweep is the only mechanism that can discover the charge.
- **Grace window** – Controlled by the `NODE_PAYMENT_RECONCILE_MINUTES` environment variable. The "sweep acts" test sets it to `'0'` via `withEnvironment`; the "sweep leaves alone" test relies on the default (non-zero) window.
- **Outbox, not inline** – The cancel listener does *not* fire synchronously inside `cancelById`. You must call `settleOutboxNudges()` before asserting on the payment's post-cancel state.
- **Idempotency assertion** – Calling `reconcileStalePayments` a second time must return `0`, guarding against double-settlement if a late webhook arrives after the sweep.
