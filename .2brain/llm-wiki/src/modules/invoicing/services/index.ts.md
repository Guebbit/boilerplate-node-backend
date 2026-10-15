---
source: src/modules/invoicing/services/index.ts
sha256: 89f429f11a3fdc60b80b5d8a03abc179a0c277c0c6f5adea145d6e35fb62a9c8
generated_at: 2026-10-15T10:39:33.639797+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/index.ts

## Purpose

Barrel / entry-point module for the invoicing service layer. It re-exports every public function, type, and the `invoicingService` convenience object from sibling service files, giving controllers, event listeners, and external modules a single import path (`@/modules/invoicing/services`) for all invoicing operations.

## Key elements

- **Re-exports** — pulls in and re-exports from:
  - `./issue-invoice` → `issueInvoice`, `findInvoiceForOrder`
  - `./issue-credit-note` → `issueCreditNote`, `findCreditNotesForOrder`, `findCreditNoteForOrderById`, `type RefundedInput`
  - `./render` → `renderInvoicePdf`, `renderCreditNotePdf`
  - `./stats` → `moneyBuckets`, `type DocumentTotals`, `type MoneyBucket`
  - `./reencrypt` → `reencryptInvoices`
  - `./numbering` → `allocateInvoiceNumber`, `allocateCreditNoteNumber`
- **`invoicingService`** (const object) — bundles a subset of the above (`issueInvoice`, `findInvoiceForOrder`, `issueCreditNote`, `findCreditNotesForOrder`, `findCreditNoteForOrderById`, `renderInvoicePdf`, `renderCreditNotePdf`, `moneyBuckets`) into one namespace for callers that prefer method-style access.

## Relationships

- **Consumed by controllers** — `get-order-invoice.ts`, `get-order-credit-note.ts`, and `get-order-credit-notes.ts` import from this module rather than reaching into individual service files.
- **Re-exported upward** — `src/modules/invoicing/index.ts` and `module.ts` surface this barrel to the rest of the app.
- **Wraps service implementations** — `issue-invoice.ts`, `issue-credit-note.ts`, `render.ts`, `stats.ts`, `reencrypt.ts`, and `numbering.ts` are the source-of-truth modules whose symbols flow through this file.
- **Exercised by tests** — `tests/integration/issue-invoice.test.ts`, `tests/integration/issue-credit-note.test.ts`, and the cross-module `returns/tests/integration/withdrawal-before-dispatch.test.ts` drive the service through this entry point.
- **Feeds stats** — `src/modules/stats/services/breakdowns.ts` consumes the `moneyBuckets` / `MoneyBucket` exports defined here.

## Notes

- `invoicingService` does **not** include `reencryptInvoices`, `allocateInvoiceNumber`, `allocateCreditNoteNumber`, or any type exports. Callers needing those must import them by name from this module (or the underlying file) rather than through the object.
- Type-only exports (`RefundedInput`, `DocumentTotals`, `MoneyBucket`) are erased at runtime; they exist purely for consumer-side type annotations.
- The module docblock documents the triggering events (`ORDER_STATUS_CHANGED` for invoices, `PAYMENT_REFUNDED` for credit notes) — a useful orientation if you are tracing *when* these functions execute without reading each service file.
