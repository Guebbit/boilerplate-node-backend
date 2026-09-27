---
source: src/modules/payments/tests/integration/settlement-email.test.ts
sha256: 226438fbfe8e4b7b5d40dc0be6f27839dafa8297f0d843da4f8211f21c87fbc2
generated_at: 2026-09-27T15:29:17.131562+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-email.test.ts

## Purpose

Integration test that pins the post-settlement email contract: when `confirmPayment` settles a payment to `succeeded` and stock commits, the buyer receives exactly one `orders.order-paid` email. It also asserts the email is **not** sent on a declined attempt and **not** re-sent when `confirmPayment` is called again for an already-settled payment.

## Key elements

- **`mockEnqueueEmail`** — jest-mocked `enqueueEmail` from the mailer adapter; all assertions inspect its call log.
- **`waitUntil(predicate, timeoutMs)`** — polling helper (10 ms tick, 2 s default) that awaits an eventually-true condition. Needed because the email send is fire-and-forget and its first step is a real Mongo read that may not settle within one microtask tick.
- **`orderFor()`** — creates a user, a product (price 25), and a single-line order; returns the trio for use in tests.
- **`paidMailSent()`** — predicate returning `true` if any `enqueueEmail` call used template `'orders.order-paid'`.
- **`GOOD_METHOD`** (`'pm_card_visa'`) — opaque card handle that triggers the success path.
- **Three test cases** under `describe('payment succeeded — the customer gets an email')`:
  1. Happy path: settles, waits, asserts one `orders.order-paid` envelope addressed to `order.email`.
  2. Decline path: uses `FAKE_DECLINE_METHOD`, waits 100 ms, asserts `paidMailSent()` is still false.
  3. Idempotency: calls `confirmPayment` twice with the same payment ID; asserts exactly one `orders.order-paid` call.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — the module under test is fully mocked here; no real SMTP or template rendering occurs.
- **`src/modules/payments/services/index.ts`** → **`src/modules/payments/services/intent.ts`** / **`src/modules/payments/services/settlement.ts`** — provides `createIntent` and `confirmPayment`, the two service functions exercised by every test.
- **`src/modules/payments/providers/fake.ts`** — supplies `FAKE_DECLINE_METHOD` for the decline test.
- **`src/modules/users/tests/factories.ts`** — `createUser`.
- **`src/modules/products/tests/factories.ts`** — `createProduct`.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`.
- **`tests/support/callers.ts`** — `asCustomer`, `testCallerContext` for caller-identity arguments.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` boots a real in-memory Mongo for the test lifecycle.

## Notes

- The email send is **fire-and-forget** (`void mailBuyer(...)`); that is why `waitUntil` polls instead of relying on a single `setImmediate` flush.
- The decline test proves **absence** with a fixed 100 ms delay rather than a poll, since nothing should ever trigger the mail on a decline.
- The idempotency guarantee relies on `SETTLEABLE_PAYMENT_STATUSES` (in the settlement service) excluding `succeeded`; a second `confirmPayment` is a no-op at the settlement layer, so no second email is enqueued.
- The mailer is mocked, but the database is a **real** Mongo instance — this is an integration test, not a unit test.
- `intent` is returned wrapped (`.data?.id`); the test casts it rather than importing a typed shape.
