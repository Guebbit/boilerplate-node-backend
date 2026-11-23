---
source: src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts
source_sha256: 28d0b14b07bac397466ca5b769f2134c36d117d670c3a5b1717ae98e45717680
context_sha256: 463af6a8cf1121cbb02eeda28de7f27a40c5f37b57d1365f2df775e5d28bfc83
generated_at: 2026-11-22T05:38:02.877839+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts

## Purpose
Integration test, run against real Mongo, for what happens when a "dead" invoice event is revived. After the invoice step is lost, replaying the paid event must issue the invoice and then one credit note per settled refund, oldest first and never twice. A refund that has not settled gets no note. The flow goes through `payments`' public service and the real `module.ts` subscription to the order-paid event.

## Key elements
- `beforeEach` registers the users, products, inventory, orders, payments and invoicing modules via `registerModules`. `afterEach` calls `resetDomainEvents`.
- `paidWithDeadInvoice()`: creates a user, a product priced 50.00 and an order of 2 items. It then creates and confirms a payment intent through `paymentService` (`pm_card_visa`), waits for the invoice, and returns `{ orderId }`.
- `refund(orderId, amount)`: refunds as an admin via `refundOrderPayment`, then calls `settleOutboxNudges()` so the credit-note listener runs.
- `loseInvoice(orderId)`: deletes the order's invoice and credit notes from `invoiceModel` and `creditNoteModel`, simulating the dead invoice step.
- `revive(orderId)`: emits `ORDER_STATUS_CHANGED` (`pending` → `paid`), as reviving the dead outbox row would.
- Test 1: refunds 30.00 and 20.00, loses the invoice, then revives **twice**. It expects exactly two notes with `grandTotal` `['30.00', '20.00']` in that order, each linked to the re-issued invoice's `_id`.
- Test 2: forces the refund to fail with `setFakeRefundFailure(..., 'declined')`, loses the invoice and revives. The invoice is re-issued but no credit notes exist.

## Relationships
- `src/kernel/registry.ts`, `src/kernel/events.ts` and `src/kernel/outbox.ts`: module wiring, event emission and reset, and outbox settling.
- `src/modules/orders/index.ts` (`ORDER_STATUS_CHANGED`), `src/modules/orders/module.ts` and `src/modules/orders/tests/factories.ts`: the orders module is registered and its factories build the paid order.
- `src/modules/payments/index.ts`, `src/modules/payments/services/index.ts` and `src/modules/payments/module.ts`: `paymentService` and the payments module drive payment and refunds.
- `scenarios/support/doubles/payments/fake.ts`: provides `setFakeRefundFailure` to make a refund fail.
- `src/modules/invoicing/model.ts` and `src/modules/invoicing/repository.ts`: `invoiceModel` and `creditNoteModel` are used to delete data, and `findCreditNotesByOrderId` to read it back.
- `src/modules/invoicing/module.ts`: the real invoicing module whose subscription to the paid event is under test.
- `src/modules/invoicing/tests/factories.ts`: `waitForInvoice`.
- `src/modules/inventory/module.ts`: registered alongside the other modules.

## Notes
- Uses `eventually` to poll for asynchronous note creation after the revive.
- The double `revive` in test 1 checks that replaying is idempotent.
- The invoice is awaited with `waitForInvoice` before asserting on notes.
