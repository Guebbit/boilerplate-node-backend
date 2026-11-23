---
source: src/modules/invoicing/tests/integration/correct-invoice.test.ts
source_sha256: 14eb861ec0d08c127821a042ef502d7fecfeefcaf5c9dda6cba03f4263eeebd0
context_sha256: 4e2843a37c1439cb97cf9fff66cbe7094772980d8a609318ee41897a31879cae
generated_at: 2026-11-22T05:37:48.717281+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/integration/correct-invoice.test.ts

## Purpose
End-to-end integration test for staff correcting the buyer (billing address) on an invoiced order. `orders` writes the new address and announces it; `invoicing` cancels the live invoice with a credit note and issues a replacement. Tests go through `orderService.correctBillingAddress` and the real `src/modules/invoicing/module.ts` subscription rather than calling the listener directly, so the event wiring is also verified. The exception is the redelivery test, which calls `correctInvoice` twice with one event id.

## Key elements
- **Setup**: `setupTestDb()`; `beforeEach` registers the users, products, inventory, orders and invoicing modules via `registerModules`; `afterEach` calls `resetDomainEvents()`.
- **`BEFORE` / `AFTER`**: the original billing address (Mario Rossi, Milano) and the corrected one (Rossi Srl with VAT number `IT01234567890`).
- **`paidAndInvoiced()`**: creates a user, a 25.00 product and an order billed to `BEFORE`, calls `markPaid`, then `waitForInvoice`. Returns `{ orderId, invoice }`.
- **`correct(orderId, address?)`**: calls `orderService.correctBillingAddress` as an admin caller (`callerContextAs('admin')`).
- **`waitForNotes(orderId, count)`**: polls with `eventually` until the order has at least `count` credit notes, then returns them.
- **`buyerOf(invoice)`**: decrypts the invoice's buyer block with `decryptInvoiceParty`.
- **`counters()`**: reads the running `seq` of the invoice and credit-note number counters.
- **Test cases** (in `describe('correcting the buyer of an invoiced order')`), as far as visible:
  - A correction produces a refund-less credit note (`reason: 'correction'`, no `refundId`). The credit note reproduces the old buyer. The old invoice becomes `corrected` and a new `issued` invoice carries the new buyer. The timeline gets `billing_corrected` and `invoice_corrected` entries.
  - After a partial refund, only the remaining amount (20.00) is credited and reissued. The new line title names the original invoice number and the refund credit note number (Art. 226(6)).
  - A later refund is credited against the live (reissued) invoice.
  - An order with no invoice yet produces no credit note, and the later invoice carries the corrected buyer.
  - Two successive corrections leave only the last invoice live, with two `correction` credit notes.
  - A repeated paid event returns the live invoice and adds none.
  - Redelivering the same correction event issues nothing and burns no numbers. The credit note's `correctionKey` equals the `order.billing_corrected` outbox row's `_id`.
  - Two racing `correctInvoice` calls on one invoice: one succeeds and one rejects, leaving one correction note and two invoices.
  - A refund that settles while a correction is running is credited too, so the same money is never credited twice. This test spies on `invoicingRepository.findCreditNotesByInvoiceId`.

## Relationships
- `src/kernel/registry.ts`, `src/kernel/events.ts`: register the module set and reset domain events between tests.
- `src/kernel/outbox.ts`: `outboxEventModel` is read to check the correction key. `settleOutboxNudges` waits for outbox processing to finish.
- `src/modules/orders/index.ts`: exports `orderService`, the entry point used for `correctBillingAddress` and `getById`.
- `src/modules/orders/module.ts`: registered in `beforeEach`.
- `src/modules/orders/friends/payments.ts`: `markPaid` triggers invoicing.
- `src/modules/inventory/module.ts`: registered as one of the modules in `beforeEach`.
- `src/modules/invoicing/module.ts`: registers the event subscription under test.
- `src/modules/invoicing/services/correct-invoice.ts`: `correctInvoice` is called directly in the redelivery and race tests.
- `src/modules/invoicing/services/index.ts`: exports `invoicingService`, used for `findInvoiceForOrder` and `issueInvoice`.
- `src/modules/invoicing/repository.ts`: `invoicingRepository` is used for assertions and spied on.
- `src/modules/invoicing/model.ts`: the invoice and credit-note counter models and document types.
- `src/modules/invoicing/pii.ts`: `decryptInvoiceParty` reads the encrypted buyer data.
- `src/modules/invoicing/tests/factories.ts`: `waitForInvoice` and `issueCreditNote`.
- `src/modules/invoicing/services/issue-credit-note.ts`: not imported by this file; it is related through the `issueCreditNote` factory, whose implementation is not visible here.

## Notes
- Asynchronous steps are awaited with `eventually` and `settleOutboxNudges`. Tests typically call `waitForNotes` and then `settleOutboxNudges` before checking the live invoice.
- The redelivery test uses the outbox row's own id as the idempotency key, because a randomly generated one would never repeat.
- In the race test, the losing correction throws when retried against the already-cancelled invoice, so the outbox would run it again.
