---
source: src/modules/invoicing/services/retention.ts
sha256: d472c661fbfb12201a87bd1d90025f80a6cb05acf7220ac4df234cb4c813e3f2
generated_at: 2026-10-29T04:15:39.810555+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/retention.ts

## Purpose

Implements the `reap:invoices` sweep: after the configured buyer-retention period expires, this service blanks the buyer (PII) block on invoices and credit notes while preserving the numbered document (seller, lines, amounts). It also deletes the cached PDF for each blanked record so the PII doesn't linger in the document store.

## Key elements

- **`BuyerErasureReport`** (interface) — return shape of the sweep: `{ invoices: number; creditNotes: number }`.
- **`eraseKind`** (private) — for one `InvoiceDocumentKind`, finds buyer-bearing documents before the scan bound, filters to those actually past retention, erases their buyer blocks via the repository, then bulk-deletes the cached PDFs.
- **`eraseDueBuyers`** (exported) — public entry point. Reads the retention years from config, runs `eraseKind` in parallel for `'invoice'` and `'credit-note'`, and returns a `BuyerErasureReport`. Accepts an optional `now: Date` for testability.

## Relationships

- **`../config`** — reads `invoicingConfig().NODE_INVOICE_BUYER_RETENTION_YEARS` to determine how old a record must be before erasure.
- **`../domain` (re-exports from `domain/retention.ts`)** — uses `buyerRetentionScanBound(years, now)` as the coarse query bound and `isBuyerRetentionOver(document, years, now)` for the precise per-document check.
- **`../repository`** — calls `invoicingRepository.findBuyerBearingBefore(kind, bound)` and `.eraseBuyers(kind, ids, now)`.
- **`../pii`** — imports the `InvoiceDocumentKind` type (discriminates `'invoice'` vs `'credit-note'`).
- **`./render`** — calls `storedDocumentName(kind, _id)` to derive the PDF key passed to the document store.
- **`@infrastructure/adapters/document-store`** — calls `removeDocument` to delete each cached PDF after the buyer block is blanked.
- **`../jobs`** — registers `eraseDueBuyers` as the `reap:invoices` scheduled job.
- **`services/index`** — re-exports this module for barrel-style imports.

## Notes

- **Ordering is deliberate.** Buyer blocks are erased *before* PDFs are deleted. If a crash occurs between the two steps, a stale PDF may briefly survive, but it carries no buyer data, and the separate `reap:invoice-pdfs` job will clean it up within its own window.
- **Idempotency.** A document whose buyer block is already blank is not returned by `findBuyerBearingBefore`, so re-running the sweep is safe.
- **Two-phase filtering.** The repository call applies a coarse date bound (`buyerRetentionScanBound`); the in-memory `isBuyerRetentionOver` check handles per-document precision (e.g., exact dates, edge cases). Don't remove either step.
- **`now` injection.** The default is `new Date()`, but tests pass a fixed date. Any code that calls `eraseDueBuyers` should forward the same `now` to both kinds to avoid a mid-sweep date rollover.
