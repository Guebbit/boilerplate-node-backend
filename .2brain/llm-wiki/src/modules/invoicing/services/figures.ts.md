---
source: src/modules/invoicing/services/figures.ts
generated_at: 2026-11-22T05:34:51.640225+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/figures.ts

## Purpose
Derives the monetary figures a document stands for from an invoice: what a full credit note mirrors, and what a correction cancels and reissues. It is shared by `issue-credit-note.ts` and `correct-invoice`, so a cancelled invoice and its replacement agree to the cent.

## Key elements
- `DocumentFigures` — type: the `lines` plus every total a frozen tax document holds (`shippingCost`, `netTotal`, `taxTotal`, shipping net/tax amounts, `taxSummary`, `shippingByRate`, `grandTotal`), picked from `FrozenTaxDocument`.
- `mirrorOf(invoice)` — returns the invoice's own figures wholesale. `shippingCost` is included only when defined.
- `figuresOfLines(lines, currency)` — builds figures from per-rate gross `CreditLine[]`. Net, tax, shipping and tax-summary values come from `creditBreakdownOf`; `grandTotal` comes from `orderTotal` over `asTaxItems(lines)` with no shipping cost.
- `remainderOf(invoice, notes)` — figures for what the invoice still stands for after credit notes:
  - With no credit notes, it returns `mirrorOf(invoice)`.
  - Otherwise it builds lines with `remainderLines` from the invoice's tax summary and the notes' tax summaries, then passes them to `figuresOfLines`.
  - It returns `undefined` when no lines remain.

## Relationships
- `./credit-breakdown.ts` — `creditBreakdownOf` supplies the VAT-extracted breakdown used by `figuresOfLines`.
- `domain/credit-shares.ts`, `domain/remainder.ts`, `domain/tax-items.ts` (via `domain/index.ts`) — `CreditLine` type, `remainderLines`, and `asTaxItems`.
- `orders/domain/totals.ts` (via `orders/index.ts`) — `orderTotal` computes the grand total.
- `infrastructure/i18n/index.ts` — `translator` renders the remainder-line title for each remainder.
- `model.ts` — `InvoiceDocument`, `CreditNoteDocument` and `FrozenTaxDocument` types.
- `issue-credit-note.ts` and `correct-invoice.ts` — the callers (per the module doc).

## Notes
- Each remainder line is titled with the invoice number and the credit note numbers (comma-joined), per Art. 226(6): a line says what was supplied.
- Remainder VAT is derived the same way as a partial credit note's, so the figures reconcile with the invoice.
- Callers must handle `undefined` from `remainderOf`, which means nothing is left to cancel or reissue.
