---
source: src/modules/invoicing/repository.ts
sha256: 5194b05d03d17199335f1c98052d4a0f37cb302f7fe64c9536b1ed93a7457c52
generated_at: 2026-11-08T06:13:37.725500+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/repository.ts

## Purpose

Hand-written persistence layer for invoices, credit notes, and their two yearly number counters. It exists as a deliberate alternative to the generic `create-repository` CRUD factory: every document here is written exactly once and later read back by `orderId` (or by a few specific lookup keys), so generic search/pagination/update/delete operations are never needed.

## Key elements

- **`invoicingRepository`** (exported object) — the single public surface. Aggregates all read, write, counter, re-encryption, buyer-sweep, and reporting functions behind one named export.
- **`findInvoiceByOrderId`** — look up the one invoice for an order (or `null`).
- **`findCreditNotesByOrderId`** / **`findCreditNoteById`** / **`findCreditNoteByRefundId`** — the three credit-note lookup paths.
- **`insertInvoice`** / **`insertCreditNote`** — transactional inserts. Both require a `ClientSession` so the number counter and the document commit atomically. Both rely on a schema-level unique index (`orderId` / `refundId`) for idempotency rather than application-level checks.
- **`sumInvoices`** / **`sumCreditNotes`** — Mongoose aggregation that groups documents by currency and time bucket within a `ReportWindow`, returning `DocumentBucketRow[]` with Decimal128 arithmetic.
- **`findBuyerBearingBefore`** / **`eraseBuyers`** — the buyer-data retention sweep. `findBuyerBearingBefore` returns lightweight `BuyerBearingDocument` rows; `eraseBuyers` unsets `billingAddress` and stamps `buyerErasedAt`. Both are idempotent (the erase re-checks `billingAddress: { $exists: true }`).
- **`incrementInvoiceNumberCounter`** / **`incrementCreditNoteNumberCounter`** — wrap `incrementYearlyCounter`; the `session` parameter is mandatory so the counter and the insert share one unit of work.
- **`reencryptInvoices`** / **`reencryptCreditNotes`** — thin re-exports of `reencryptOf` bound to each model.
- **`DocumentBucketRow`** (exported interface) — shape of one aggregated reporting row.
- **`BuyerBearingDocument`** (exported interface) — the minimal projection the retention service reads.

## Relationships

- **`./model`** — source of all four Mongoose models (`invoiceModel`, `creditNoteModel`, and the two counter models) and the `FrozenTaxDocument`, `InvoiceDocument`, `CreditNoteDocument` type aliases used in signatures.
- **`./pii`** — supplies the `InvoiceDocumentKind` union type that keys the buyer-sweep functions.
- **`@infrastructure/persistence/report`** — provides `bucketOf` (used inside the aggregation) and the `ReportWindow` type for the reporting window parameter.
- **`@infrastructure/persistence/yearly-counter`** — provides `incrementYearlyCounter`, the shared counter-increment primitive.
- **`@infrastructure/security/reencrypt`** — provides `reencryptOf`, re-exposed per collection.
- **`services/issue-invoice.ts`** — caller of `insertInvoice` and `incrementInvoiceNumberCounter`.
- **`services/issue-credit-note.ts`** — caller of `insertCreditNote`, `findCreditNoteByRefundId`, `incrementCreditNoteNumberCounter`.
- **`services/numbering.ts`** — caller of the two counter-increment functions.
- **`services/personal-data.ts`** / **`services/retention.ts`** — callers of `findBuyerBearingBefore` and `eraseBuyers`.
- **`services/reencrypt.ts`** — caller of `reencryptInvoices` / `reencryptCreditNotes`.
- **`services/stats.ts`** — caller of `sumInvoices` / `sumCreditNotes`.
- **`tests/factories.ts`** — constructs fixture documents matching the model shapes.
- **`tests/integration/credit-note-catch-up.test.ts`** / **`tests/integration/download.test.ts`** — integration tests exercising the read paths.

## Notes

- **Idempotency is index-enforced, not check-then-insert.** `insertInvoice` and `insertCreditNote` do not pre-check for an existing document; the unique index on `orderId` / `refundId` rejects duplicates with a duplicate-key error. The caller is expected to catch that error and read back the winner.
- **`session` is non-optional on inserts and counter increments.** This is a contractual requirement (not just a hint): the number must and the document must commit or abort together, otherwise the gap-free VAT number series is broken (cited: VAT Directive Art. 226(2)).
- **`insertInvoice`/`insertCreditNote` use `Model.create([fields], { session })`** (array form) because that is the only Mongoose signature that accepts a session option and still returns the document. The `[invoice]` destructuring is load-bearing.
- **`_id` is caller-allocated** (`WithId` interface). The id is generated *outside* the transaction so a retried transaction reuses the same id rather than minting a new one.
- **`sumDocuments` is generic over `Model<TDocument>`** rather than over a union type, because a union of Mongoose model types does not type-check. The same pattern applies to `buyerSweepOf`.
- **Buyer erase is safe to re-run.** The `updateMany` filter re-checks `billingAddress: { $exists: true }`, so a racing or repeated sweep is a no-op.
