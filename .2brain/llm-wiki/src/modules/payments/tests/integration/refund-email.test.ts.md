---
source: src/modules/payments/tests/integration/refund-email.test.ts
sha256: 3afa3950303ba42d157a07ade2607f6957050d3857d4f14e6a5060517fb48523
generated_at: 2026-11-08T07:34:48.247851+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-email.test.ts

## Purpose

Integration test verifying the email-notice policy around refunds: a standalone (non-return) refund triggers a `payments.refund-issued` mail to the buyer, while return-attached refunds and provider-refused refunds stay silent. Also asserts authorization boundaries for who may initiate a return refund.

## Key elements

- **`paidOrder()`** — Builds a fully paid order (user, product at 50.00 × 2, card payment via `payByCard`, inventory hold, outbox settlement) and returns the actors/IDs needed by tests.
- **`waitForMails(done)`** — Polls `done` while delivering the outbox pass on each tick (`settleOutboxNudges`), because mails ride the outbox relay.
- **`mailsOf(template)` / `dataOf(template)`** — Query the mocked `enqueueEmail` call log filtered by template name; `dataOf` extracts the template-data object from the first match.
- **`refundedOf(orderId)`** — Reads `paymentRepository.findByOrderId` to assert the `amountRefunded` decimal after a refund attempt.
- **`refundOrderPayment` / `refundForReturn`** — Imported from `@modules/payments/tests/factories`; the two entry points under test (standalone admin refund vs. return-linked refund).
- **Three `describe` blocks** — (1) refund-outside-return mails the buyer, including partial-vs-full wording and the cancel-then-refund sequence; (2) authorization rules for return refunds (anonymous, non-buyer customer, buyer cancellation, manager); (3) silence cases (return refund, provider refusal).

## Relationships

- **`@infrastructure/adapters/mailer`** — Fully mocked; the test asserts on `enqueueEmail` call count, recipient, and template data.
- **`@kernel/outbox`** — `settleOutboxNudges` is called to flush the outbox relay that actually dispatches the mail; `waitForMails` interleaves this with polling.
- **`@kernel/events`** — `resetDomainEvents` in `afterEach` clears the in-memory event bus between tests.
- **`@modules/payments/module`** — Registered via `registerCheckoutModules` so its `payment.succeeded` / refund listeners are active.
- **`@modules/payments/repository`** — `paymentRepository.findByOrderId` is used to verify `amountRefunded` state.
- **`@modules/payments/tests/factories`** — Provides `refundOrderPayment`, `payByCard`, `refundForReturn` (the actions under test).
- **`@modules/orders/tests/factories`** — `createOrder`, `toOrderItem` build the order fixture.
- **`@modules/orders/index`** — `orderService.cancelOnRequestById` exercised in the cancel-then-refund scenario.
- **`@modules/inventory/services/index`** — `inventoryService.reserveForOrder` satisfies the pre-settlement hold the `payment.succeeded` listener expects.
- **`scenarios/support/doubles/payments/fake`** — `fakePaymentProvider` is the in-memory provider; one test spies on its `refund` to simulate a refusal.
- **`@modules/users/tests/factories`**, **`@modules/products/tests/factories`** — `createUser`, `createProduct` seed the fixture.
- **`tests/support/callers.ts`** — `asCustomer`, `asAdmin`, `testCallerContext`, `callerContextAs` build the caller-identity objects for authorization assertions.

## Notes

- The mail is fire-and-forget through the outbox, so tests must poll (`eventually` + `settleOutboxNudges`) rather than assert synchronously. Absence is proven by a `settleOutboxNudges` tick after the action, not a hard wait.
- `paidOrder` calls `settleOutboxNudges` after `payByCard` to let the settlement relay publish its rows before the test proceeds—mirroring real timing where delivery lands well before any later refund.
- The "everything vs. part of what you paid" distinction is asserted by reading the `detail` string in the template data, not by a separate boolean field.
- The provider-refusal test expects a `201` response (accepted-but-failed) rather than an error, then asserts zero mails.
