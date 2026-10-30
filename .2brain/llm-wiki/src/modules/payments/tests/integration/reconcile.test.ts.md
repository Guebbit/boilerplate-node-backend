---
source: src/modules/payments/tests/integration/reconcile.test.ts
sha256: d93d8bea1a1fa5570463bce93a226c11ca49d3374399ce1b2d64618f6f513089
generated_at: 2026-10-29T05:18:03.733192+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/reconcile.test.ts

## Purpose

Integration test verifying two reconciliation paths against a fake PSP: (1) the stale-payment sweep detects and settles a charge the provider confirmed but the application never heard about (a "lost webhook"), and (2) cancelling an order whose intent already succeeded at the provider triggers a refund rather than leaving money stranded. The fake PSP (`fakePaymentProvider`) stands in for the real provider; "lost webhook" is simulated by calling `confirm` on the fake without delivering any event to the application.

## Key elements

- **`chargedAtProvider()`** – Sets up a user, product, and order, creates a payment intent, then calls `fakePaymentProvider.confirm` so the provider side shows a successful charge while the application still sees `requires_confirmation`.
- **`unconfirmedIntent()`** – Similar setup but stops after `createIntent` (no provider-side attempt), modelling a card that was never presented.
- **`paymentStatusOf(orderId)` / `orderStatusOf(orderId)`** – Thin async helpers that read current status from the repository / service.
- **`describe('reconcileStalePayments')`** – Core sweep tests: settles a lost-webhook payment, enforces the 200-per-run cap, respects the grace window, and is idempotent on a second pass.
- **`describe('reconcileStalePayments, on a payment nobody attempted…')`** – Edge cases: unconfirmed intents are left alone, a declined payment is not re-opened, and a `requires_action` payment is still settled if the provider shows success.
- **`describe('cancelling an order whose intent already succeeded…')`** – Verifies `orderService.cancelOnRequestById` refunds the charge; the refund is observed after `settleOutboxNudges()`.

## Relationships

- **`fakePaymentProvider`** (`scenarios/support/doubles/payments/fake.ts`) – The fake PSP; tests call `confirm` and `retrieve` on it directly to simulate provider-side state.
- **`paymentService`** (`src/modules/payments/services/index.ts`) – Under-test subject: `createIntent`, `confirmPayment`, `reconcileStalePayments`.
- **`paymentRepository`** (`src/modules/payments/repository.ts`) – Reads/writes payment records; `findStaleInFlight` is spied on to assert the 200 cap.
- **`orderService`** (`src/modules/orders/index.ts`) – `getById` for assertions; `cancelOnRequestById` for the cancel-path test.
- **`paymentsModule`** (`src/modules/payments/module.ts`) – Registered via `registerCheckoutModules` in `beforeEach`.
- **`settleOutboxNudges`** (`src/kernel/outbox.ts`) – Flashes queued outbox events so the `order.cancelled` listener fires before assertions.
- **`resetDomainEvents`** (`src/kernel/events.ts`) – Called in `afterEach` to clear accumulated domain events between tests.
- **`reservationRepository`** (`src/modules/inventory/tests/factories.ts`) – Read to confirm reconciliation does not mutate reservation expiry.
- **Factories** (`users`, `products`, `orders` test factories) – Seed the test DB with minimal domain entities.
- **`asCustomer`, `testCallerContext`** (`tests/support/callers.ts`) – Supply the caller identity expected by payment/order services.
- **`registerCheckoutModules`** (`tests/support/checkout-modules.ts`) – Wires the payment module into the test runtime.

## Notes

- The grace-window bypass is done via `withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' })`; without it, freshly created payments fall inside the window and the sweep is a no-op.
- The cancel-path test **must** call `settleOutboxNudges()` before asserting refund state—the `order.cancelled` event reaches the payment listener asynchronously through the outbox, not synchronously.
- The 200-cap test uses a `jest.spyOn` on `paymentRepository.findStaleInFlight` rather than creating 200+ real rows, keeping it fast.
- The "does not turn an open answer into a decline" test spies on `fakePaymentProvider.retrieve` to return `{ status: 'open' }`, simulating a provider that still shows the intent as open even after a local decline—verifying the sweep does not flip the status back.
