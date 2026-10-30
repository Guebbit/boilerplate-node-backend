---
source: src/modules/invoicing/repository.ts
sha256: 5194b05d03d17199335f1c98052d4a0f37cb302f7fe64c9536b1ed93a7457c52
generated_at: 2026-10-29T04:13:24.819281+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/repository.ts

## Purpose

Hand-written persistence layer for the invoicing domain: it provides the exact read and write operations that invoices, credit notes, and their two numbering counters need. It intentionally bypasses the generic `@infrastructure/persistence/create-repository` CRUD factory because neither document type is ever searched, paginated, updated, or deleted — each is written once and read back by `orderId`.

## Key elements

- **`invoicingRepository`** (exported) — the single namespace object the services consume. Bundles every operation below plus the counter and re-encrypt helpers.
- **`findInvoiceByOrderId`** — returns the single invoice for an order (or `null`).
- **`insertInvoice`** — inserts a new invoice inside a `ClientSession`; uses Mongoose's array-form `create` because it is the only overload that accepts `{ session }`.
- **`findCreditNotesByOrderId`** — all credit notes for an order, oldest first.
- **`findCreditNoteById`** — one credit note scoped to an order; a foreign-order id resolves to `null`.
- **`findCreditNoteByRefundId`** — the credit note linked to a single refund record.
- **`insertCreditNote`** — inserts a credit note inside a session; same concurrency guard as `insertInvoice` via the unique `refundId` index.
- **`sumInvoices` / `sumCreditNotes`** — wrap the shared `sumDocuments` aggregation: match a half-open time window, group by currency + bucket, and sum goods-net, shipping-net, tax, and gross as stored Decimal128.
- **`findBuyerBearingBefore` / `eraseBuyers`** — the two operations of the buyer-PII retention sweep, dispatched per `InvoiceDocumentKind`. `erase` is idempotent (re-checks `billingAddress: { $exists: true }`).
- **`reencryptInvoices` / `reencryptCreditNotes`** — delegates to `reencryptOf` from the security module.
- **`incrementInvoiceNumberCounter` / `incrementCreditNoteNumberCounter`** — thin wrappers over `incrementYearlyCounter`; require a `ClientSession` so the number allocation commits or aborts atomically with the document insert.
- **`DocumentBucketRow`** (exported interface) — shape of one aggregation row.
- **`BuyerBearingDocument`** (exported interface) — the minimal projection the retention sweep reads.
- **`WithId`** (internal) — asserts that `_id` was pre-allocated by the caller before insert.

## Relationships

- **`./model.ts`** — source of all Mongoose models (`invoiceModel`, `creditNoteModel`, both counter models) and the `FrozenTaxDocument`, `InvoiceDocument`, `CreditNoteDocument` types used throughout.
- **`./pii.ts`** — provides the `InvoiceDocumentKind` discriminator used to select the correct collection in buyer-sweep calls.
- **`@infrastructure/security/reencrypt`** — supplies `reencryptOf`, which this module wraps into the two `reencrypt*` entries.
- **`@infrastructure/persistence/report`** — supplies `bucketOf` (used inside the aggregation `$group`) and the `ReportWindow` type that callers pass in.
- **`@infrastructure/persistence/yearly-counter`** — supplies `incrementYearlyCounter`; this module binds it to each counter model and forwards the session.
- **`./services/issue-invoice.ts` / `issue-credit-note.ts`** — call `insertInvoice` / `insertCreditNote` and the counter increments inside the same transaction.
- **`./services/numbering.ts`** — allocates the number (counter increment) that the service then passes as part of the frozen fields to `insert*`.
- **`./services/retention.ts`** — calls `findBuyerBearingBefore` and `eraseBuyers` for both kinds.
- **`./services/reencrypt.ts`** — calls `reencryptInvoices` / `reencryptCreditNotes`.
- **`./services/stats.ts`** — calls `sumInvoices` / `sumCreditNotes` with a `ReportWindow`.
- **`./services/personal-data.ts`** — reads `findInvoiceByOrderId`, `findCreditNotesByOrderId`, `findCreditNoteById`.
- **`./tests/factories.ts`** — provides test fixtures consumed by the integration tests that exercise these operations.
- **`./tests/integration/credit-note-catch-up.test.ts`** / **`download.test.ts`** — integration tests that call the repository directly against a real Mongo.

## Notes

- **`_id` is pre-allocated by the caller** (outside the transaction) so that a retried transaction reuses the same id rather than generating a new one.
- **Concurrency safety** relies on unique indexes (`orderId` for invoices, `refundId` for credit notes). A duplicate-key error means a concurrent writer won; the caller is expected to read the winner back after its transaction aborts. The event bus that fires `PAYMENT_REFUNDED` provides no de-duplication of its own.
- **Mongoose quirk:** `Model.create` with an array is the only form whose options object accepts `{ session }`; the `.then(([doc]) => doc)` unwrapping is load-bearing.
- **`buyerSweepOf` is generic** over `Model<TDocument>` rather than accepting a union of the two concrete models, because a union does not type-check in Mongoose's generics.
- **Number-gap concern:** the counter increment and the document insert must share a single `ClientSession`; a gap in the gap-free series is a compliance issue (referenced: VAT Directive Art. 226(2)).
