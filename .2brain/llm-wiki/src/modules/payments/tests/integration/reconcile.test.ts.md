---
source: src/modules/payments/tests/integration/reconcile.test.ts
source_sha256: d0b72e6af3e0be5d1fddfce207669e89913f8d1b73ff337ede6e4c8a1164fc1c
context_sha256: 788928a3fc1c4c44c5a394716df32867689239f5177dd77ab172fa18675827a6
generated_at: 2026-11-22T06:58:28.680306+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/reconcile.test.ts

## Purpose
Integration tests for recovering from payment webhooks that never arrived. They cover the reconciliation sweep (`paymentService.reconcileStalePayments`), which asks the provider about stale unsettled payments. They also cover the order-cancel path, which asks the provider once when it refuses to close an intent that already succeeded. A "lost webhook" is simulated by confirming the payment at the fake PSP without telling the application.

## Key elements
- `chargedAtProvider()`: helper that creates a user, product (25.00, 10 on hand) and order. It then creates a payment intent and confirms it at the fake provider with `pm_card_visa`, so no webhook is seen. Returns `{ user, orderId }`.
- `unconfirmedIntent()`: helper that creates an order and an intent but never presents a card. Returns `{ user, orderId, paymentId }`.
- `paymentStatusOf` / `orderStatusOf`: helpers that read the payment status or order status for an order id, or `undefined` if missing.
- `describe('reconcileStalePayments')`:
  - settles a provider-charged payment: the payment becomes `succeeded` and the order `paid`, with 1 payment moved.
  - requests at most 200 payments per run: it spies on `paymentRepository.findStaleInFlight` and expects it to be called with `(Date, 200)`.
  - leaves payments younger than the grace window alone (returns 0, order stays `pending`).
  - is idempotent: a second sweep after settlement returns 0.
- `describe('... on a payment nobody attempted or that stopped')`:
  - an unconfirmed intent stays `requires_confirmation`, and its reservation `expiresAt` is unchanged.
  - a `declined` payment stays declined even when `retrieve` is mocked to return `open`.
  - a payment stuck at `requires_action` (`pm_card_authentication_required`) is settled to `succeeded`/`paid` once the provider has succeeded.
- `describe('cancelling an order whose intent already succeeded at the provider')`: `orderService.cancelOnRequestById` succeeds. After `settleOutboxNudges()`, the payment is `succeeded` and the order is `canceled`.

## Relationships
- `paymentService` (`payments/services`) provides `createIntent`, `confirmPayment` and `reconcileStalePayments`. These are the code under test.
- `paymentRepository` (`payments/repository`) is used to read payments (`findByOrderId`) and is spied on for `findStaleInFlight`.
- `orderService` (`orders`) provides `getById` and `cancelOnRequestById`.
- `scenarios/support/doubles/payments/fake.ts` supplies `fakePaymentProvider`, the fake PSP. The tests call its `confirm` and spy on its `retrieve`.
- `kernel/events` (`resetDomainEvents`) is called after each test. `kernel/outbox` (`settleOutboxNudges`) is awaited so that outbox-delivered events reach their listeners.
- `tests/checkout-modules` (`registerCheckoutModules`) registers `payments/module` before each test.
- `tests/callers` provides `asCustomer` and `testCallerContext`.
- The users, products and orders `tests/factories` files supply `createUser`, `createProduct`, `createOrder` and `toOrderItem`.
- `inventory/tests/factories` supplies `reservationRepository`, used to check reservation expiry.
- `@tests/setup-test-db` (`setupTestDb`) and `@tests/environment` (`withEnvironmentOverrides`) are imported from outside the listed neighbors.

## Notes
- Sweep tests set `NODE_PAYMENT_RECONCILE_MINUTES: '0'` through `withEnvironmentOverrides` to make payments stale immediately. The grace-window test deliberately does not set it.
- `reservationRepository` is imported from the inventory *tests/factories* module, not from `src/modules/inventory/repository.ts`.
- Spies (`findStaleInFlight`, `retrieve`) are restored manually with `mockRestore()` inside the tests.
- The cancel test expects the payment to remain `succeeded` while the order becomes `canceled`. The test title says the money is "returned", but it asserts only these two statuses.
