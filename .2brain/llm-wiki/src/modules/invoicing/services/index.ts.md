---
source: src/modules/invoicing/services/index.ts
sha256: 20c980121995a4f31763ffea36cbc319f4c9e0706f0caa39c540dc230c8a9dc2
generated_at: 2026-10-29T04:14:16.812079+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/index.ts

## Purpose

Facade (barrel) file that re-exports every invoicing operation into a single `invoicingService` object. It exists so that controllers, event listeners, tests, and sibling modules have one import site instead of reaching into individual service files.

## Key elements

- **`invoicingService`** — the sole runtime export. A plain object bundling all service operations:
  - `issueInvoice` / `findInvoiceForOrder` — create (freeze) and retrieve an invoice, triggered by `ORDER_STATUS_CHANGED`.
  - `findCreditNotesForOrder` / `findCreditNoteForOrderById` — look up credit notes, created per refund on `PAYMENT_REFUNDED`.
  - `invoiceForCaller` / `creditNotesForCaller` / `creditNoteForCaller` — permission-checked reads (from `for-caller.ts`).
  - `renderInvoicePdf` / `renderCreditNotePdf` — convert a stored document to PDF bytes via the e-invoicing port (from `render.ts`).
  - `moneyBuckets` — aggregate financial statistics (from `stats.ts`).
  - `reencryptInvoices` — bulk re-encryption of stored documents (from `reencrypt.ts`).
  - `eraseDueBuyers` — GDPR/retention erasure (from `retention.ts`).
- **Type re-exports** — `RefundedInput`, `BuyerErasureReport`, `DocumentTotals`, `MoneyBucket` so consumers don't need to import from leaf files.

## Relationships

- **Consumed by** `src/modules/invoicing/controllers/get-order-invoice.ts`, `get-order-credit-note.ts`, and `get-order-credit-notes.ts`, which call into `invoicingService` to fetch and render documents.
- **Re-exported through** `src/modules/invoicing/index.ts` and wired into the module via `src/modules/invoicing/module.ts`.
- **Aggregates** the sibling service files (`for-caller.ts`, `issue-invoice.ts`, `issue-credit-note.ts`, `render.ts`, `reencrypt.ts`, `retention.ts`, `stats.ts`)—this file is the only point at which they are grouped.
- **Tested indirectly** by `src/modules/invoicing/tests/integration/issue-invoice.test.ts`, `retention.test.ts`, and cross-module `src/modules/account/tests/contract/shop.contract.test.ts`, all of which import `invoicingService` rather than individual services.

## Notes

- All runtime exports go through the single `invoicingService` object; there are no named function exports from this file. Tests and controllers should import `invoicingService` (or the type re-exports), not the underlying `./issue-invoice` or `./render` files directly.
- The module doc comment states the event triggers explicitly (`ORDER_STATUS_CHANGED`, `PAYMENT_REFUNDED`); these are not visible in the code of this file itself.
- `renderInvoicePdf` / `renderCreditNotePdf` delegate to an "e-invoicing port" (an abstraction boundary) defined in `render.ts`; the facade does not add logic.
