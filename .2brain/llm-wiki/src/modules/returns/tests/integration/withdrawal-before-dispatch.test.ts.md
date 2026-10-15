---
source: src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts
sha256: 2acd06e5aa21f920bcbc896c5128f29fe44943d55b89e2e5ac5035aa4c1a62cb
generated_at: 2026-10-15T12:01:10.144034+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts

## Purpose

Integration test that pins the cross-module contract for a customer withdrawing a paid order before dispatch: the order is cancelled, the payment is refunded in full through the order's own refund path, and the return record is written already closed. It asserts that exactly one `payment.refunded` event, one credit note, and one mail from `returns` are produced — so the refund and the return never announce the same money twice.

## Key elements

- **`paidOrder()`** — builds a user, two products (shirt $30, mug $10), an order, an inventory reservation, and a confirmed card payment; settles the outbox so the settlement rows are visible.
- **`waitFor(check)`** — polls a predicate (10 ms interval, 3 s timeout) for async work that `settleOutboxNudges` does not await (e.g. the `void`-started refund mail inside `announceRefund`).
- **`describe('a withdrawal before dispatch on a paid order')`** — three tests:
  - *refunds once, one credit note, return closed at birth* — asserts order status, payment `displayStatus: 'refunded'` / `amountRefunded: 40`, single `PAYMENT_REFUNDED` event with **no** `returnId`, and exactly one credit note.
  - *one mail from returns* — filters `enqueueEmail` calls for the `returns.notice` template; asserts one acknowledgement mail with no postage/address lines.
  - *money-back mail once, no cancel notice* — asserts exactly one `payments.refund-issued` mail, one `returns.notice`, and zero `orders.order-cancelled` mails.
- **Mailer mock** — `enqueueEmail` from the mailer adapter is replaced with a `jest.fn()` to capture and assert on sent templates.

## Relationships

- **`src/kernel/events.ts`** — `onDomainEvent` subscribes to `PAYMENT_REFUNDED` to collect refund payloads; `resetDomainEvents` clears subscriptions between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` drives the relay pass that flushes outbox entries and runs both listeners of a single event.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the sole mail seam under test; the mock intercepts every send.
- **`src/modules/payments/index.ts`** — provides `paymentService` (status lookup), `createIntent`, `confirmPayment`, and the `PAYMENT_REFUNDED` event constant.
- **`src/modules/payments/module.ts`** — registered via `registerCheckoutModules` so its event subscriptions (refund, settlement) are active during the test.
- **`src/modules/invoicing/index.ts`** — `invoicingService.findCreditNotesForOrder` is used to assert exactly one credit note was issued.
- **`src/modules/invoicing/module.ts`** — registered so its `PAYMENT_REFUNDED` listener (credit-note creation) fires during the relay pass.
- **`src/modules/inventory/index.ts`** — `inventoryService.reserveForOrder` sets up stock reservation before the order is treated as paid.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `readOrder`, `toOrderItem` build the order fixture.

## Notes

- The return is **closed at birth**; the test asserts it is not closed a second time by the refund event. The refund event carries no `returnId`, keeping the two records decoupled.
- `waitFor` is needed because `announceRefund` starts its mail with `void`; `settleOutboxNudges` returns before that fire-and-forget completes. Without it the refund-issued mail assertion would be flaky.
- `orders.order-cancelled` mail is explicitly **not** expected. A withdrawal is acknowledged by the `returns` module's `returns.notice`, not by the generic person-cancel mail.
- `registerCheckoutModules` must include **all three** modules (payments, invoicing, returns) so that every cross-module event subscription is wired before any assertion.
