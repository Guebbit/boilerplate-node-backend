---
source: src/modules/invoicing/repository.ts
source_sha256: a78d67d2171734387d3b3a70c0c3afac56dbfa1efc9b3627d6337b3051ceb15e
context_sha256: b3ea9fb5cd7560301db5931594e75989daf5b208650dafd313bcad1e5594f3ee
generated_at: 2026-11-22T05:33:55.377594+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/repository.ts

## Purpose
Hand-written persistence layer for invoices, credit notes and their two yearly numbering counters. It exists instead of the generic `create-repository` factory because neither document is ever searched, paginated, updated or deleted. Each is written once and read back by `orderId`.

## Key elements
- **`invoicingRepository`**: the only runtime export, an object that bundles every operation below.
- **Invoice reads and writes**
  - `findInvoiceByOrderId` returns the live invoice, meaning `status: 'issued'`. It accepts an optional session.
  - `findInvoicesByOrderId` returns all invoices for an order, oldest first, including corrected ones.
  - `markInvoiceCorrected` flips `issued` to `corrected` conditionally and returns whether this call did the flip.
  - `insertInvoice` inserts with a pre-allocated `_id` inside a required session.
- **Credit-note reads and writes**
  - `findCreditNotesByOrderId`, `findCreditNoteById` (scoped to the order), `findCreditNotesByInvoiceId`, `findCreditNoteByCorrectionKey` and `findCreditNoteByRefundId`.
  - `insertCreditNote` inserts a credit note with `invoiceId`, `invoiceNumber`, `reason` and an optional `refundId` or `correctionKey`.
- **Counters**: `incrementInvoiceNumberCounter(year, session)` and `incrementCreditNoteNumberCounter(year, session)` delegate to `incrementYearlyCounter`.
- **Reporting**: `sumInvoices(window)` and `sumCreditNotes(window)` use the shared `sumDocuments` aggregate. It groups by currency and bucket and returns `DocumentBucketRow[]` with document count, goods net, shipping net, tax and gross.
- **Retention sweep**
  - `findBuyerBearingBefore(kind, bound)` finds documents issued before `bound` that still hold a `billingAddress`.
  - `eraseBuyers(kind, ids, at)` unsets `billingAddress` and sets `buyerErasedAt`.
  - Both are built per collection by `buyerSweepOf`.
- **`reencryptInvoices` / `reencryptCreditNotes`**: built with `reencryptOf(model)`.
- **Exported types**: `DocumentBucketRow` and `BuyerBearingDocument` (`_id`, `issuedAt`, `timezone`).

## Relationships
- **`./model`**: supplies the invoice, credit-note and counter Mongoose models plus the `FrozenTaxDocument`, `InvoiceDocument`, `CreditNoteDocument` and `CreditNoteReason` types.
- **`./pii`**: supplies `InvoiceDocumentKind`, which selects the invoice or credit-note collection in the buyer sweep.
- **`@infrastructure/persistence/report`**: supplies `bucketOf` and `ReportWindow` for the summing aggregation.
- **`@infrastructure/persistence/yearly-counter`**: supplies `incrementYearlyCounter` for the numbering counters.
- **`@infrastructure/security/reencrypt`**: supplies `reencryptOf` for the re-encryption entries.
- **Callers**: the services (`issue-invoice`, `issue-credit-note`, `correct-invoice`, `numbering`, `personal-data`, `reencrypt`, `retention`, `stats`), the test `factories.ts` and the `correct-invoice` integration test are the neighbors that sit alongside this file in the graph. The file itself shows only its own exports, so which of them call which functions is not visible here.

## Notes
- **Number and insert share a transaction.** The counter increments and inserts require a `ClientSession` so the number and the document commit or abort together. This keeps the invoice series gap-free (VAT Directive Art. 226(2)).
- **Pre-allocated `_id`.** It is chosen outside the transaction, so a retried transaction reuses it.
- **Duplicate prevention relies on unique indexes.** A second invoice for one order, or a second credit note for one refund, is refused by a unique index with a duplicate-key error. The caller reads the winner back after its transaction aborts.
- **Conditional correction.** `markInvoiceCorrected` only matches `status: 'issued'`, so two concurrent corrections cannot both cancel the same invoice.
- **Retention erase is idempotent.** The update filter repeats `billingAddress: { $exists: true }`, so a repeated or racing run changes nothing.
- **Sums stay in Decimal128.** Goods net is `netTotal` minus `shippingNetAmount`, subtracted as stored Decimal128, so cents do not drift. The row sums are typed `unknown` because Mongo returns them as decimals.
- **Generic helpers.** `sumDocuments` and `buyerSweepOf` are generic over the model, because a union of the two model types does not type-check in Mongoose.
- **Order scoping.** `findCreditNoteById` returns `null` for an id that belongs to another order, the same as for a missing id.
