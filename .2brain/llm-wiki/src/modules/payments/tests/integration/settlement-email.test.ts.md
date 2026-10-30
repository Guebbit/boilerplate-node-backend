---
source: src/modules/payments/tests/integration/settlement-email.test.ts
sha256: 1f8a0f7db12e41db2f71d5e523f88242ebbc8bc4bdb319666e211f716fc89dab
generated_at: 2026-10-29T05:21:25.592042+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-email.test.ts

## Purpose

Integration test that pins the `payment.succeeded` listener contract: the buyer receives exactly one `payments.payment-received` email when a payment settles, but never on a declined attempt or on a redundant re-confirmation of an already-settled payment.

## Key elements

- **`mockEnqueueEmail`** — Jest mock for `enqueueEmail` (from the mailer adapter); used to assert *which* template was sent and to how many recipients.
- **`orderFor()`** — Builds a minimal fixture: one user, one product (price 25), one order with a single item. Returns the objects needed to create and confirm a payment intent.
- **`paidMailSent()`** — Scans `mockEnqueueEmail.mock.calls` for a `payments.payment-received` template; returns a boolean.
- **`GOOD_METHOD`** (`'pm_card_visa'`) — An opaque payment-method handle representing a valid, settle-able card.
- **`describe('payment succeeded — the customer gets an email')`** — Contains three cases:
  - Happy path: email enqueued to the correct address after `confirmPayment` succeeds.
  - Decline path: no email enqueued when `FAKE_DECLINE_METHOD` is used.
  - Idempotency: a second `confirmPayment` on an already-succeeded intent does not duplicate the email.

## Relationships

- **`src/modules/payments/services/index.ts`** — Under test; calls `paymentService.createIntent` and `paymentService.confirmPayment` to drive the settlement flow.
- **`src/modules/payments/module.ts`** — Registered via `registerCheckoutModules` so the module's event listeners (including the `payment.succeeded` handler) are active.
- **`src/infrastructure/adapters/mailer.ts`** — Mocked at module level; the test asserts on its `enqueueEmail` calls rather than sending real mail.
- **`scenarios/support/doubles/payments/fake.ts`** — Supplies `FAKE_DECLINE_METHOD`, a payment method that always declines, used in the negative case.
- **`src/kernel/events.ts`** — `resetDomainEvents()` called in `afterEach` to prevent listener state leaking between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes pending outbox work so the test can assert absence of side-effects.
- **`tests/support/eventually.ts`** — `eventually(paidMailSent)` polls until the fire-and-forget mail dispatch completes.
- **`tests/support/callers.ts`** — `asCustomer` and `testCallerContext` provide the caller identity and context for service calls.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module into the checkout event-bus for the test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions an isolated test database.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** — Domain factories to seed a user, product, and order.

## Notes

- The mail dispatch is **fire-and-forget** and begins with a real Mongo read, so it does not resolve within the same tick as `confirmPayment`. Tests must use `eventually()` (happy path) or `settleOutboxNudges()` (absence/idempotency paths) before asserting on `mockEnqueueEmail`.
- The idempotency test relies on `SETTLEABLE_PAYMENT_STATUSES` in the payment service excluding `succeeded`; a re-confirm is a no-op at the domain level, not a test-level guard.
- `FAKE_DECLINE_METHOD` is an opaque handle (not a card number); the comment in the file explicitly calls this out to prevent misuse as real credential data.
- `jest.mock` is placed at the top of the file (hoisted by Jest); the mock replaces the entire mailer module, so no other mailer behavior is exercised.
