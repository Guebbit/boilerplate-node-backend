---
source: src/modules/orders/tests/unit/notify.test.ts
sha256: 936d57a74c57f531377ffab8399cce64a3b6fdcbdd322f0f69a6fbfe64131278
generated_at: 2026-11-08T07:12:56.110076+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/notify.test.ts

## Purpose

Unit tests for the `mailBuyer` policy function (in `services/notify.ts`), verifying its guard and fallback behaviour: that anonymised orders are silently skipped and that a failed buyer lookup degrades gracefully to the order's own email as the display name. The actual email body is out of scope here — it is covered by the listener/integration tests.

## Key elements

- **`orderFixture(overrides?)`** — builds a minimal `OrderDocument` stub (card payment, single item, EUR) via `asStub`, spread-merging any overrides the caller supplies.
- **`enqueueEmailMock`** — module-level `jest.fn()` that backs the `jest.mock('@infrastructure/adapters/mailer')` factory; reset in `beforeEach`.
- **`describe('mailBuyer — anonymised order')`** — two tests:
  - Asserts `mailBuyer` calls *neither* the build callback *nor* `enqueueEmail` when `order.email === ANONYMIZED_EMAIL`.
  - Asserts the build callback *is* invoked with the real email when it is not the anonymised sentinel.
- **`describe('mailBuyer — buyer lookup fails')`** — spies on `userService.getById` to reject; asserts the build callback receives the order email as the name and that `logger.error` is called with a structured `{ message, orderId, error }` payload.

## Relationships

- **`services/notify.ts`** — the system under test; `mailBuyer` is the only imported symbol.
- **`domain/anonymization.ts`** — supplies the `ANONYMIZED_EMAIL` sentinel used to drive the short-circuit path.
- **`model.ts`** — provides the `OrderDocument` type for the fixture shape.
- **`@infrastructure/adapters/logger`** — spied on (`logger.error`) to assert the failure path logs the expected structured object.
- **`@modules/users` (→ `services/index.ts`)** — `userService.getById` is spied to simulate a lookup failure.
- **`@tests/stub` (`tests/support/stub.ts`)** — `asStub` used to create loosely-typed order fixtures without a full Mongoose document.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` is mocked at module level to intercept and assert on mail dispatch.

## Notes

- The module doc comment explicitly scopes this file to *policy* (guard + fallback). The rendered email body is asserted elsewhere (listener tests), so absence of body assertions here is intentional, not an oversight.
- `enqueueEmail` is mocked via a `jest.mock` factory that delegates to `enqueueEmailMock`; the mock is resolved to `undefined` by default and cleared in `beforeEach`.
- The `build` argument passed to `mailBuyer` is a plain `jest.fn()` representing the mail-body builder — the test never inspects its return value, only whether it was called and with what arguments.
- The anonymised-order test passes `undefined` as `userId`, while the lookup-failure test sets a real `Types.ObjectId` — confirming that `mailBuyer` only attempts a user lookup when `userId` is present.
