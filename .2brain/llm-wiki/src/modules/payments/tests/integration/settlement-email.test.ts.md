---
source: src/modules/payments/tests/integration/settlement-email.test.ts
sha256: fe1e1fc08db96fd622f254a9eb4e84d9a0203f109bee8e59a7d3058c21cd74d4
generated_at: 2026-10-15T11:36:23.048725+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-email.test.ts

## Purpose

Integration test that pins the `payment.succeeded` email behavior: a buyer receives a `payments.payment-received` email **only** when a payment settles to `succeeded` and stock actually commits. It explicitly guards against the two common false-positive cases — a declined attempt and a retry of an already-settled payment — so the mailer adapter is never called in either scenario.

## Key elements

- **`waitUntil(predicate, timeoutMs?)`** – Polls every 10 ms until `predicate` is true or the timeout elapses. Needed because the listener fires the mail send as a fire-and-forget `void` call whose first step is a real Mongo read, so a single microtask flush is insufficient.
- **`orderFor()`** – Convenience fixture: creates a user, a product (price 25), and a single-line order, returning `{ user, order }`.
- **`paidMailSent()`** – Inspects the mocked `enqueueEmail` call log for a call whose second argument is the template string `'payments.payment-received'`.
- **`GOOD_METHOD`** (`'pm_card_visa'`) – Opaque Stripe-style payment-method reference used for the happy-path `confirmPayment` calls.
- **`FAKE_DECLINE_METHOD`** – Imported from the payments fake double; causes the intent to settle as declined.
- **`describe('payment succeeded — the customer gets an email')`** – Three cases:
  1. Happy path: email is enqueued to `order.email` after a successful settlement.
  2. Decline: no email is enqueued (asserted after a 100 ms grace period).
  3. Idempotency: a second `confirmPayment` on the same already-succeeded payment does **not** produce a second email.
- **Mocks / setup** – `enqueueEmail` is `jest.mock`-ed; `setupTestDb()` provides a real (in-memory) database; `registerCheckoutModules([paymentsModule])` wires the module; `resetDomainEvents()` and `jest.restoreAllMocks()` run in `afterEach`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is the function under test; it is mocked at module level and its call log is the sole assertion target.
- **`src/modules/payments/services/index.ts`** – Re-exports `createIntent` and `confirmPayment`, the two service calls that drive the payment lifecycle under test.
- **`src/modules/payments/module.ts`** – The payments module is registered via `registerCheckoutModules` so its domain-event listeners (including the email listener) are active.
- **`src/kernel/events.ts`** – `resetDomainEvents` clears the in-memory event bus between tests to prevent listener leakage.
- **`scenarios/support/doubles/payments/fake.ts`** – Supplies `FAKE_DECLINE_METHOD`, a payment-method reference the service recognises as a decline.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** – Provide the `createUser`, `createProduct`, `createOrder`, and `toOrderItem` helpers used by `orderFor()`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the real database the services (and the mail listener's `userService.getById` read) depend on.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` installs module-level listeners for the test run.
- **`tests/support/callers.ts`** – `asCustomer` and `testCallerContext` build the caller/actor context passed to service calls.

## Notes

- The mail listener is **fire-and-forget** (`void mailBuyer(...)`); the `waitUntil` helper exists specifically because the listener's first I/O step (a Mongo `getById`) may not resolve within one `setImmediate` tick of `confirmPayment`'s own promise.
- The decline and idempotency tests assert **absence** with a fixed 100 ms sleep rather than a poll loop, since there is nothing to wait *for*.
- The idempotency guard relies on `SETTLEABLE_PAYMENT_STATUSES` excluding `succeeded`; the test documents this contract in a comment but does not directly test the status-set logic.
- `GOOD_METHOD` is deliberately an opaque token (`pm_card_visa`), not a card number — the test never handles raw card data.
