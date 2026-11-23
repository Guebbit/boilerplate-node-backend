---
source: src/modules/invoicing/services/retention.ts
source_sha256: f75b206317a8f5a3f38694501ad028000058363957323700c61a4b1482bb889a
context_sha256: 1413046b49ace783ba6052695e7320013309eb34ff554831f029450bb0945959
generated_at: 2026-11-22T05:36:53.222826+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/retention.ts

## Purpose
Implements the `reap:invoices` sweep. It blanks the buyer block of every invoice and credit note whose tax retention period has ended. The numbered document stays, with its seller, lines and amounts, because stats read revenue from it and a credit note points at its invoice. Only the person's data is removed. It also deletes the cached PDFs of the blanked documents.

## Key elements
- `BuyerErasureReport`: interface with `invoices` and `creditNotes` counts of documents that lost their buyer block.
- `eraseKind(kind, years, now)` (internal): handles one document kind.
  1. Finds buyer-bearing candidates older than `buyerRetentionScanBound(years, now)`.
  2. Filters them with `isBuyerRetentionOver`.
  3. Calls `invoicingRepository.eraseBuyers` with the due ids and `now`.
  4. Removes each document's cached PDF with `removeDocument(storedDocumentName(kind, id))`.
  5. Returns the count reported by `eraseBuyers`. If nothing is due, it returns 0 and skips the repository write and the PDF deletion.
- `eraseDueBuyers(now = new Date())` (exported): the sweep entry point. It reads `NODE_INVOICE_BUYER_RETENTION_YEARS` from `invoicingConfig()` and runs `eraseKind` for `'invoice'` and `'credit-note'` concurrently. It resolves to a `BuyerErasureReport`. The `now` parameter lets tests inject a time.

## Relationships
- `src/modules/invoicing/config.ts`: `invoicingConfig()` supplies the retention years.
- `src/modules/invoicing/domain/index.ts` (retention logic in `src/modules/invoicing/domain/retention.ts`): provides `buyerRetentionScanBound` and `isBuyerRetentionOver`.
- `src/modules/invoicing/repository.ts`: `invoicingRepository` is used to find candidates and to erase buyers.
- `src/modules/invoicing/pii.ts`: provides the `InvoiceDocumentKind` type.
- `src/modules/invoicing/services/render.ts`: `storedDocumentName` gives the cached PDF name for a document.
- `src/infrastructure/adapters/document-store.ts`: `removeDocument` deletes the cached PDF.
- `src/modules/invoicing/jobs.ts` and `src/modules/invoicing/services/index.ts` are not imported by this file.

## Notes
- Order matters: buyers are blanked first and PDFs deleted second. A PDF rendered between the two steps would carry no buyer. A PDF that survives a crash is reaped by `reap:invoice-pdfs` within its own window.
- The sweep is idempotent: a document without a buyer block is not a candidate.
- Candidates are narrowed twice: first by the repository query using the scan bound, then by the per-document `isBuyerRetentionOver` check.
