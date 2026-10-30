---
source: src/modules/payments/tests/integration/refund-email.test.ts
sha256: 863bfe1c89882ebd4fbdd511f8d60644dbd22f3ccfb2b712b52e07e07c687f90
generated_at: 2026-10-29T05:18:58.290421+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-email.test.ts

## Purpose

Integration test that verifies which refunds trigger a `payments.refund-issued` email to the buyer and which stay silent. It also exercises the authorization matrix on `refundForReturn` (who may initiate a goods-return refund vs. a cancellation-remainder refund) and confirms that a provider-level failure produces no mail.

## Key elements

- **`waitForMails(done)`** — Polling helper that calls `settleOutboxNudges()` before each check, because mail is dispatched through the outbox relay, not synchronously.
- **`mailsOf(template)`** / **`dataOf(template)`** — Filter the mocked `enqueueEmail` call list by template name; `dataOf` returns the first matching call's template-data object.
- **`paidOrder()`** — Builds a fully paid order (user, product at 50.00 × 2, card payment, inventory reservation, outbox settle) and returns `{ user, order, orderId }`.
- **`refundedOf(orderId)`** — Reads `paymentRepository.findByOrderId` and returns `amountRefunded` (or 0) to assert no money moved.
- **`describe("a refund outside a return mails the buyer")`** — Verifies partial-refund wording ("part of what you paid"), full-refund wording ("everything"), cumulative-refund judgment across two refunds, and the cancel-then-refund mail sequence.
- **`describe("who may return money for a return")`** — Parameterized and individual cases asserting that anonymous callers, non-staff customers, and other customers are rejected; the order's own buyer may cancel the remainder; staff (manager) may receive a goods-return refund.
- **`describe("a refund that must not mail")`** — Confirms zero `payments.refund-issued` mails for a return's refund (returns module owns that notice) and for a provider-refused refund.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is fully mocked; every assertion inspects its call history.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` is invoked to drain the outbox relay before assertions; it is what actually triggers `enqueueEmail`.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` clears any queued domain events between tests.
- **`src/modules/payments/tests/factories.ts`** — Provides `refundOrderPayment`, `payByCard`, and `refundForReturn`, the actions under test.
- **`src/modules/payments/module.ts`** — `paymentsModule` is registered via `registerCheckoutModules` in `beforeEach`.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` is used by `refundedOf` to read persisted refund state.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/tests/factories.ts`** — `orderService.cancelOnRequestById` and `createOrder`/`toOrderItem` support the cancel-then-refund scenario.
- **`src/modules/inventory/index.ts`** — `inventoryService.reserveForOrder` is called in `paidOrder` so the `payment.succeeded` listener has a valid hold.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`** — `createUser`, `createProduct` build the order's buyer and item.
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider.refund` is spied on (and rejected once) in the provider-failure test.
- **`tests/support/callers.ts`** — `asCustomer`, `asAdmin`, `testCallerContext`, `callerContextAs` supply the caller identities for authorization tests.

## Notes

- **Fire-and-forget timing.** Mail is enqueued asynchronously via the outbox relay, so tests must poll (`eventually` + `settleOutboxNudges`) rather than await a direct return. For *absence* assertions the test calls `settleOutboxNudges()` once, giving a straggler a window to appear before asserting length 0.
- **Inventory reservation is mandatory in setup.** `payByCard` fires `payment.succeeded` listeners synchronously; without `inventoryService.reserveForOrder` the order lacks the hold a real checkout would have, and downstream logic may misbehave.
- **Provider-refusal still returns 201.** The API acks the refund request (201) even when the provider rejects it; the test asserts `.resolves.toMatchObject({ success: true, status: 201 })` and then checks no mail was sent.
- **Buyer cancellation vs. goods return.** `refundForReturn` with `reason: 'cancellation'` is permitted for the order's own buyer (it is their withdrawal of remaining funds). The same call with a default/goods-return reason is restricted to staff. Distinguish these two paths when modifying authorization logic.
- **`jest.restoreAllMocks()` in `afterEach`** restores the `fakePaymentProvider.refund` spy set up with `mockRejectedValueOnce`, preventing bleed between tests.
