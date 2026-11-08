---
source: src/modules/payments/tests/integration/settlement-email.test.ts
sha256: a3ea9b08c0208f7a64095fc23bc8fe3370d0080a5417dfd639469f8c27fd272b
generated_at: 2026-11-08T07:37:21.116378+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-email.test.ts

## Purpose

Integration test that pins the `payment.succeeded` listener's contract: the buyer receives exactly one `payments.payment-received` email when a payment actually commits stock, and receives none on a decline or on a no-op retry of an already-settled payment. The placed-order confirmation email is deliberately out of scope here.

## Key elements

- **`orderFor()`** — builds a user, a product (`$25.00`), and a single-line order, returning them for a test to pay against.
- **`paidMailSent()`** — inspects the mocked `enqueueEmail` calls for the `payments.payment-received` template.
- **`GOOD_METHOD`** (`'pm_card_visa'`) — opaque Stripe-style payment-method handle used for successful confirmations.
- **Three `it` blocks** (single `describe`):
  1. *mails the buyer once the payment settles and the stock actually commits* — happy path; asserts `envelope.to` equals the order's email.
  2. *sends no payment-succeeded mail for a declined attempt* — uses `FAKE_DECLINE_METHOD`; asserts absence after `settleOutboxNudges()`.
  3. *sends only one payment-succeeded mail even if confirm is called again* — calls `confirmPayment` twice with the same payment ID; asserts exactly one enqueue call.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with `jest.fn()` so no real mail is sent.
- **`beforeEach`** — clears the mail mock and re-registers `paymentsModule` into the checkout pipeline.
- **`afterEach`** — calls `resetDomainEvents()` and `jest.restoreAllMocks()`.

## Relationships

- **`src/modules/payments/services/index.ts`** — calls `paymentService.createIntent` and `paymentService.confirmPayment`; this is the system under test.
- **`src/modules/payments/module.ts`** — registered via `registerCheckoutModules` so the `payment.succeeded` event listener is wired in.
- **`src/infrastructure/adapters/mailer.ts`** — mocked; the test asserts against its `enqueueEmail` spy.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears in-memory domain-event subscriptions between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes pending outbox nudges; used before negative assertions to ensure no stray mail arrives.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module into the test checkout pipeline.
- **`tests/support/callers.ts`** — `asCustomer` and `testCallerContext` provide the caller/actor context expected by the payment service.
- **`tests/support/eventually.ts`** — `eventually` polls asynchronously because the mail send is fire-and-forget and performs a real Mongo read before enqueuing.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory/test database.
- **`scenarios/support/doubles/payments/fake.ts`** — supplies `FAKE_DECLINE_METHOD` for the decline-path test.
- **`src/modules/users/tests/factories.ts`** — `createUser`.
- **`src/modules/products/tests/factories.ts`** — `createProduct`.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`.

## Notes

- The mail send is **fire-and-forget** and its first step is a **real Mongo read**, so it does not complete within one tick of `confirmPayment` resolving. Positive assertions must use `eventually(paidMailSent)`; negative assertions use `settleOutboxNudges()` to give any straggler a chance to appear before asserting absence.
- The email template name is the string literal `'payments.payment-received'` — if the template is renamed in the mailer, this test breaks silently (the spy simply never matches).
- `GOOD_METHOD` is intentionally an opaque handle; the test never touches a real card number or Stripe API.
- The test file lives under `tests/integration/` but imports from the production `src/` tree; it relies on a running test DB (via `setupTestDb`) rather than pure unit mocks for the order/payment state.
