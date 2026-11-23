---
source: src/modules/invoicing/presenter.ts
source_sha256: 39f87dad00f6cc5c57bd83620ddeeab2b94fedf7b99ac0f6b51220a5d2ef0c9a
context_sha256: bb73a6ddc08f8296e00c8562d65a84d7418d0aa44317801070829dd1be13a8f7
generated_at: 2026-11-22T05:33:05.903108+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/presenter.ts

## Purpose
Converts frozen invoice and credit-note documents into JSON-ready shapes. It is the one place in the invoicing module where frozen documents become JSON: the `POST /account/export` section and the per-order credit-note list. Other reads in the module return rendered PDFs, not the frozen document.

## Key elements
- `ExportedDocument` — export-wire interface with `orderId`, `number`, `issuedAt` (a `Date`), `currency` and `grandTotal` (a string). It deliberately omits the rest of the internal document.
- `presentExportedDocument(document)` — takes an `InvoiceDocument` or `CreditNoteDocument` and returns an `ExportedDocument`. It converts `orderId` to a string and formats `grandTotal` with `padDecimal(grandTotal, currency)`.
- `presentCreditNoteSummary(creditNote)` — takes a `CreditNoteDocument` and returns a `CreditNoteSummary`, one row of the per-order list. Fields:
  - `id` is `String(_id)`.
  - `issuedAt` is an ISO string.
  - `grandTotal` is padded with `padDecimal`.
  - `reason` is copied across.
  - `refundId` is included only when it is not `undefined`.

## Relationships
- `src/domain-primitives/money.ts` — supplies `padDecimal`, used for the `grandTotal` formatting in both presenters.
- `src/modules/invoicing/model.ts` — supplies the `InvoiceDocument` and `CreditNoteDocument` input types.
- `src/types/index.ts` — supplies the `CreditNoteSummary` return type, imported via the `@types` alias.
- `src/modules/invoicing/controllers/get-order-credit-notes.ts` — the credit-note list controller, which is the natural consumer of `presentCreditNoteSummary`. The visible file does not show how it is called.
- `src/modules/invoicing/services/personal-data.ts` — the module docs mention the `POST /account/export` section, which `presentExportedDocument` serves. The visible file does not show how `personal-data.ts` uses it.

## Notes
- The two functions format dates differently. `presentExportedDocument` keeps `issuedAt` as a `Date`, while `presentCreditNoteSummary` returns an ISO string.
- `refundId` is left out of the summary when it is `undefined`, rather than being set to `undefined`.
