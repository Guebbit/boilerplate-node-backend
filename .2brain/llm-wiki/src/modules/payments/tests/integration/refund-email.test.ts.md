---
source: src/modules/payments/tests/integration/refund-email.test.ts
sha256: 6b95791654ba7c21721bf7dacb52a12f98676aa243593679c6069c66459d7659
generated_at: 2026-10-15T11:35:01.443329+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-email.test.ts

## Purpose

Integration test verifying that the `payments.refund-issued` email is sent (or deliberately **not** sent) when a refund is processed. It asserts the boundary: a standalone admin refund mails the buyer; a refund tied to a return is left to `returns`' closing notice; a provider-rejected refund moves no money and stays silent.

## Key elements

- **`waitUntil(predicate, timeoutMs?)`** – Polls a predicate until true, calling `settleOutboxNudges()` each tick so an in-flight outbox pass can deliver the email. Throws on timeout.
- **`settleQuietly()`** – A 150 ms pause used before asserting *absence* of an email, giving any straggler a last chance to appear.
- **`mailsOf(template)`** – Filters `enqueueEmail` mock calls by template name.
- **`dataOf(template)`** – Returns the `Record<string, string>` payload of the first matching email.
- **`paidOrder()`** – Full scenario builder: creates user → product → order, reserves inventory (satisfying `payment.succeeded` listeners), creates a payment intent, confirms it with a Visa card, then settles the outbox so settlement rows land. Returns `{ user, order, orderId }`.
- **`describe("a refund outside a return mails the buyer")`** – Four cases: partial refund wording, full-refund wording ("everything"), sequential refunds where only the last says "everything", and a paid-cancel flow where the cancelled notice precedes the refund notice.
- **`describe("a refund that must not mail")`** – Two cases: `refundForReturn` produces no `payments.refund-issued` mail; a provider rejection (mocked via `fakePaymentProvider.refund`) also produces none.

## Relationships

- **`@infrastructure/adapters/mailer` (`enqueueEmail`)** – Fully mocked at module level; the test asserts on its call log rather than on real SMTP.
- **`@kernel/outbox` (`settleOutboxNudges`)** – Driven inside `waitUntil` to let outbox-scheduled mail actually fire; also called once after `paidOrder` so settlement rows are published before the test proceeds.
- **`@kernel/events` (`resetDomainEvents`)** – Called in `afterEach` to clear any queued domain events between tests.
- **`@modules/payments/services`** – Exercises the real `createIntent`, `confirmPayment`, `refundByOrder`, and `refundForReturn` service functions (backed by `intent.ts`, `refunds.ts`, `settlement.ts`).
- **`@modules/payments/module`** – Registered via `registerCheckoutModules` so the module's listeners (including the refund-mail listener under test) are active.
- **`@scenarios/support/doubles/payments/fake` (`fakePaymentProvider`)** – Spied on to simulate a provider rejection in the "no money moved" case.
- **`@modules/orders` (`orderService`)** – Used for the `cancelById` call in the paid-cancel scenario.
- **`@modules/inventory` (`inventoryService.reserveForOrder`)** – Required so the `payment.succeeded` listener chain sees an already-held order, mirroring a real checkout.
- **`@modules/orders/tests/factories`** – `createOrder` / `toOrderItem` build the order fixture.

## Notes

- The test runs against a **real MongoDB** (`setupTestDb`); only the mailer and (in one case) the payment provider are mocked. This is intentional: the outbox → mailer path must execute for the assertion to be meaningful.
- Email delivery is **async via the outbox**, which is why the test uses polling (`waitUntil`) rather than a synchronous `await` on the service call. The comment in `waitUntil` explicitly notes that each poll "lets a pass that started meanwhile deliver."
- The file is structurally a sibling of `settlement-email.test.ts` (referenced in the module docblock) and follows the same fire-and-forget polling pattern.
- `paidOrder` must call `inventoryService.reserveForOrder` **before** `confirmPayment`; without the hold, the `payment.succeeded` listener that triggers settlement (and ultimately the refund-mail listener) will not fire.
- The "everything vs. part" wording assertion depends on the refunds *settled so far* at the moment the email is composed, not on the original order total—verified by the sequential 30 → 70 test.
