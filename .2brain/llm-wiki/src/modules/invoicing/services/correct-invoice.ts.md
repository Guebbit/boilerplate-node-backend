---
source: src/modules/invoicing/services/correct-invoice.ts
generated_at: 2026-11-22T05:34:29.054492+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/correct-invoice.ts

## Purpose
Cancels an invoice whose buyer details were corrected and reissues it to the right buyer. It is the work behind this module's `order.billing_corrected` listener (`module.ts`). No money moves: the credit note and the replacement invoice carry the same figures, so the books net to zero. This follows VAT Directive Art. 219, under which a change to an invoice is a new document that points back to the old one.

## Key elements
- **`correctInvoice(orderId, eventId)`** is the only export. It loads the order's invoice and the order, builds a `Correction`, and runs it in a transaction. It returns the credit note this correction issued (or the one a redelivery already issued), or `undefined` when there was nothing to correct. It is marked `@internal` and is not on `invoicingService`.
- **`correctWithin(correction, session)`** is the unit of work inside the transaction:
  1. Re-reads the live invoice and throws if it is no longer the live one.
  2. Computes what is still invoiced with `remainderOf(invoice, creditNotes)`. If nothing is left, it returns without writing anything.
  3. Allocates a credit-note number and inserts the cancelling credit note.
  4. Marks the old invoice `corrected`. This throws if it is no longer live.
  5. Allocates an invoice number and inserts the replacement invoice.
  6. Appends an `invoice_corrected` timeline event to the order.
- **`cancellingCreditNote(...)`** builds the credit note. Its reason is `'correction'`, it stores `correctionKey`, and it reuses the invoice's timezone, currency, locale and seller. The old buyer's billing address is decrypted under the invoice's id and re-encrypted under the note's id.
- **`replacementInvoice(...)`** builds the new invoice. It has the same figures, the shop's current timezone (`shopTimezone()`), a freshly read seller (`frozenSeller()`), and the corrected buyer's billing address encrypted under the new invoice's id.
- **`Correction`** is an interface holding everything decided before the transaction opens: the invoice, the buyer, `correctionKey`, one shared `issuedAt`, and the pre-allocated `noteId` and `invoiceId`.

## Relationships
- `src/infrastructure/runtime/database.ts`: `withTransaction` wraps the whole correction in one transaction.
- `src/modules/invoicing/repository.ts`: `invoicingRepository` finds the live invoice and its credit notes, inserts the credit note and invoice, marks the invoice corrected, and looks up credit notes by `correctionKey`.
- `src/modules/invoicing/services/numbering.ts`: `allocateCreditNoteNumber` and `allocateInvoiceNumber` allocate the numbers inside the transaction. `readWinner` is the `.catch` handler that recovers the credit note when a concurrent or redelivered correction wins.
- `src/modules/invoicing/services/issue-invoice.ts`: `findInvoiceForOrder` finds the invoice to correct. `buyerOf` maps the order's billing address to an `InvoiceParty`. `frozenSeller` supplies the seller snapshot for the new invoice.
- `src/modules/invoicing/services/figures.ts`: `remainderOf` and the `DocumentFigures` type give the amounts that are still invoiced.
- `src/modules/invoicing/pii.ts`: `encryptInvoiceParty` and `decryptInvoiceParty` handle the billing-address encryption.
- `src/modules/invoicing/model.ts`: provides the `InvoiceDocument`, `CreditNoteDocument` and `InvoiceParty` types.
- `src/modules/orders/index.ts` (`@modules/orders`): exports `orderService`, used for loading the order, deriving its billing address and appending the timeline event.
- `src/modules/shop/index.ts` (`@modules/shop`): exports `shopTimezone()`.
- `src/modules/invoicing/module.ts`: its `order.billing_corrected` listener is the only intended caller.
- `src/modules/invoicing/tests/integration/correct-invoice.test.ts`: the integration test for this file.

## Notes
- **Idempotency:** `correctionKey` is the outbox event id, or a fresh ObjectId when `eventId` is absent (a plain in-process emit with no redelivery). A redelivered event is a no-op because the credit note already exists under that key.
- **Reads happen inside the transaction.** Reading outside it would let a correction and a concurrent refund both credit the same money. A write conflict makes the loser rerun from the top; a refund's credit-note flow (referenced in a comment) conflicts with a correction on the same credit-note counter.
- **Retry-safe ids:** the ids, `issuedAt`, buyer and key are decided before the transaction, so a driver retry reuses them. Both numbers and both dates share one `issuedAt`.
- **Throwing is deliberate:** if another correction already cancelled the invoice, `correctWithin` throws so the event is retried against the newer invoice. Returning quietly would drop the correction.
- **No invoice means nothing to do:** if the order has no invoice yet, `correctInvoice` returns `undefined`, because the future invoice will freeze the corrected address anyway.
- **Gap-free numbering:** the credit note, the `corrected` flip, the new invoice and the timeline row commit together, so no number is lost.
- **Missing billing address:** if the order has no billing address, the replacement invoice is issued without one.
