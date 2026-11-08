---
source: src/modules/invoicing/services/retention.ts
sha256: d472c661fbfb12201a87bd1d90025f80a6cb05acf7220ac4df234cb4c813e3f2
generated_at: 2026-11-08T06:15:56.028118+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/retention.ts

## Purpose

Implements the `reap:invoices` sweep: once a buyer's tax-retention window has expired, the buyer block is blanked from the invoice or credit-note document and its cached PDF is deleted. The numbered document itself (seller, line items, amounts) is preserved so revenue stats and credit-note→invoice links remain intact. Only the personal data is removed.

## Key elements

- **`BuyerErasureReport`** (interface) — shape of the sweep result: `{ invoices: number; creditNotes: number }`.
- **`eraseKind`** (module-private) — for one document kind: queries candidates via the repository, filters with the domain retention check, blanks the buyer block, then deletes the cached PDF. Returns the count erased.
- **`eraseDueBuyers`** (exported) — public entry point for the `reap:invoices` job. Reads the retention-years config, runs `eraseKind` for `'invoice'` and `'credit-note'` in parallel, and returns a `BuyerErasureReport`. Accepts an injectable `now` (defaults to `new Date()`) for deterministic testing.

## Relationships

- **`../config`** — reads `NODE_INVOICE_BUYER_RETENTION_YEARS` from `invoicingConfig()`.
- **`../domain`** (via `domain/index.ts` / `domain/retention.ts`) — uses `buyerRetentionScanBound` to compute the scan cutoff and `isBuyerRetentionOver` for the per-document check.
- **`../repository`** — calls `invoicingRepository.findBuyerBearingBefore` and `invoicingRepository.eraseBuyers`.
- **`../pii`** — imports the `InvoiceDocumentKind` type that drives the kind-specific logic.
- **`./render`** — calls `storedDocumentName(kind, id)` to derive the PDF key to delete.
- **`@infrastructure/adapters/document-store`** — calls `removeDocument` to delete the cached PDF after blanking.
- **`../jobs`** — the caller that schedules `eraseDueBuyers` as the `reap:invoices` job.
- **`services/index.ts`** — barrel re-export of this module.

## Notes

- **Ordering is deliberate:** buyer block is blanked *before* the PDF is deleted. If a PDF render sneaks in between the two steps, it carries no buyer data. A PDF that survives a crash is reaped later by the separate `reap:invoice-pdfs` job.
- **Idempotent:** documents that no longer carry a buyer block will not match the `findBuyerBearingBefore` query, so re-running the sweep is safe.
- **Testability:** the `now` parameter on `eraseDueBuyers` (and internally on `eraseKind`) allows tests to pin the clock without mocking `Date`.
