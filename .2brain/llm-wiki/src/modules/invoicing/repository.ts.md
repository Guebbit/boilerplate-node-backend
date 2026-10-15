---
source: src/modules/invoicing/repository.ts
sha256: dca94faeb3cb8d8874b236ff025faa700d35f02ff95ca04177b1e9fa20ccd805
generated_at: 2026-10-15T10:39:21.820271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/repository.ts

## Purpose

Hand-written persistence layer for invoices, credit notes, and their two per-year numbering counters. It deliberately avoids the generic `create-repository` factory because every document is written once and read back only by `orderId` — no searching, paginating, updating, or deleting ever occurs, so the generic CRUD would add nothing.

## Key elements

- **`invoicingRepository`** (exported object) — the single public entry point bundling every operation below.
- **`findInvoiceByOrderId`** / **`findCreditNotesByOrderId`** / **`findCreditNoteById`** / **`findCreditNoteByRefundId`** — read paths; credit-note lookups are scoped to their parent order or refund for safe addressing.
- **`insertInvoice`** / **`insertCreditNote`** — write paths; accept a pre-allocated `_id` (`WithId`) and an optional `ClientSession`. Idempotency is enforced by unique indexes (one invoice per order, one credit note per refund).
- **`incrementInvoiceNumberCounter`** / **`incrementCreditNoteNumberCounter`** — atomic `findOneAndUpdate($inc, upsert)` on the respective counter model; called inside the same transaction as the insert so an abort returns the number.
- **`sumInvoices`** / **`sumCreditNotes`** — MongoDB aggregation that matches a `ReportWindow`, groups by currency + time bucket, and sums document count, goods-net, shipping-net, tax, and gross. Goods-net is computed as `netTotal − shippingNetAmount` in Decimal128 to avoid float drift.
- **`reencryptInvoices`** / **`reencryptCreditNotes`** — thin delegates to `reencryptOf(model)` from the security layer.
- **`DocumentBucketRow`** (exported interface) — shape of one aggregation row.
- **`WithId`** (internal interface) — requires a caller-supplied `_id: Types.ObjectId`.

## Relationships

- **`./model.ts`** — source of all four Mongoose models (`invoiceModel`, `creditNoteModel`, `invoiceNumberCounterModel`, `creditNoteNumberCounterModel`) and the shared types `FrozenTaxDocument`, `InvoiceDocument`, `CreditNoteDocument`.
- **`@infrastructure/security/reencrypt`** — provides `reencryptOf`, wrapped here to expose `reencryptInvoices` / `reencryptCreditNotes`.
- **`@infrastructure/persistence/report`** — provides `bucketOf` (used inside the aggregation `$group`) and the `ReportWindow` type that `sumInvoices`/`sumCreditNotes` accept.
- **`services/issue-invoice.ts`** and **`services/issue-credit-note.ts`** — consume `insertInvoice`, `insertCreditNote`, the counter increments, and the read paths within their respective transactional flows.
- **`services/numbering.ts`** — calls the counter-increment functions to allocate document numbers.
- **`services/stats.ts`** — calls `sumInvoices` / `sumCreditNotes` to build reporting output.
- **`services/personal-data.ts`** / **`services/reencrypt.ts`** — call the reencrypt helpers to re-encrypt stored personal data.
- **`tests/integration/*.test.ts`** — exercise the full read/write/numbering/reencrypt paths against a live database.

## Notes

- **Mongoose `create` with an array** (`model.create([fields], { session })`) is used because it is the only `create` signature that accepts a `ClientSession`; the result is unwrapped from the array immediately.
- **`_id` is allocated by the caller, outside the transaction.** On a retry the same id is reused, so a duplicate insert hits the unique index rather than producing a second document.
- **Idempotency is index-backed, not check-then-insert.** A concurrent second invoice for an order (or credit note for a refund) surfaces as a duplicate-key error; the caller is expected to read the winner back after the abort.
- **`findCreditNoteById` returns `null` for a cross-order id** indistinguishably from a non-existent id — callers cannot tell the two apart.
- The module docblock explicitly states the reason the generic `@infrastructure/persistence/create-repository` factory was not used; do not "upgrade" to it without re-evaluating that premise.
