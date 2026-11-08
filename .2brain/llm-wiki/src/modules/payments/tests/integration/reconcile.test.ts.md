---
source: src/modules/payments/tests/integration/reconcile.test.ts
sha256: b2459f09aac1a1b311f6ef0213dbe3f366d1b07cb85988598e90bdb11741622a
generated_at: 2026-11-08T07:33:52.866169+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/reconcile.test.ts

## Purpose

Integration tests for the payment reconciliation sweep and the cancel-time provider query. The core scenario: the PSP charges a card but the confirming webhook is lost, leaving the payment stuck in an in-flight state. The sweep asks the provider about those stale payments and settles them; the cancel path asks the provider once when it refuses to close an intent that already succeeded.

## Key elements

- **`chargedAtProvider()`** — Fixture: creates a user, product, order, opens a payment intent, then confirms the charge on `fakePaymentProvider` without telling the app (simulating a lost webhook).
- **`unconfirmedIntent()`** — Fixture: creates an order and opens an intent but never attempts the payment (card never presented).
- **`paymentStatusOf(orderId)` / `orderStatusOf(orderId)`** — Small async helpers to read payment/order status for assertions.
- **`describe('reconcileStalePayments')`** — Verifies the sweep settles a lost-webhook payment, respects the 200-per-run batch cap, skips payments younger than the grace window, and is idempotent (second call moves 0).
- **`describe('reconcileStalePayments, on a payment nobody attempted or that stopped')`** — Edge cases: unconfirmed intents are left alone (reservation expiry untouched), a declined payment is not flipped back to open, and a `requires_action` payment still settles once the provider reports success.
- **`describe('cancelling an order whose intent already succeeded at the provider')`** — Cancel flow where the provider already charged; asserts refund via outbox and final status pair (`succeeded` / `canceled`).

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` is the stand-in PSP; tests call `.confirm()` to simulate a provider-side charge and mock `.retrieve()` for the "provider says open" case.
- **`src/modules/payments/services/index.ts`** — `paymentService` provides `createIntent`, `reconcileStalePayments`, `confirmPayment`; the unit under test.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` reads state; `findStaleInFlight` is spied on to assert the batch-limit argument.
- **`src/modules/payments/module.ts`** — `paymentsModule` is registered via `registerCheckoutModules` in `beforeEach` so event listeners are active.
- **`src/modules/orders/index.ts`** — `orderService.getById` and `orderService.cancelOnRequestById` drive the order-side assertions and the cancel test.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes the outbox so the `order.canceled` event reaches the refund listener before asserting.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears accumulated domain events between tests.
- **`src/modules/inventory/tests/factories.ts`** — `reservationRepository.findByOrderId` is used to assert that reconciliation does not alter reservation expiry on unconfirmed intents.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** — Provide `createUser`, `createProduct`, `createOrder`, `toOrderItem` fixtures.
- **`tests/support/callers.ts`** — `asCustomer` and `testCallerContext` supply the caller identity for service calls.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module (and its event subscriptions) into the test harness.

## Notes

- The grace window is zeroed per-test via `withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' })`; without this override the sweep skips any payment younger than the production window.
- The "lost webhook" is modelled purely by confirming on the fake PSP and *not* calling any application endpoint—no real network or webhook simulation is involved.
- The cancel test relies on the outbox (not inline delivery) for the `order.canceled` → refund listener hop; forgetting `settleOutboxNudges()` will leave the payment un-refunded and the assertion will fail.
- Batch cap is asserted structurally (spy on `findStaleInFlight` with a literal `200`), not by actually creating 200+ records.
