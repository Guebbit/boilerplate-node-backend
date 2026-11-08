---
source: src/modules/invoicing/services/index.ts
sha256: 20c980121995a4f31763ffea36cbc319f4c9e0706f0caa39c540dc230c8a9dc2
generated_at: 2026-11-08T06:14:22.100631+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/index.ts

## Purpose

Barrel (facade) module for the invoicing service layer. It aggregates every operation a controller, event listener, or test might call into a single `invoicingService` object so callers have one import target instead of reaching into individual sibling files.

## Key elements

- **`invoicingService`** — the sole runtime export; an object literal bundling:
  - `issueInvoice`, `findInvoiceForOrder` — freeze / look up an invoice from an order
  - `findCreditNotesForOrder`, `findCreditNoteForOrderById` — look up credit notes
  - `invoiceForCaller`, `creditNotesForCaller`, `creditNoteForCaller` — caller-facing query helpers
  - `renderInvoicePdf`, `renderCreditNotePdf` — produce PDF bytes via the e-invoicing port
  - `moneyBuckets` — financial stat aggregation
  - `reencryptInvoices` — bulk re-encryption of stored documents
  - `eraseDueBuyers` — retention-driven data erasure
- **Type re-exports** (no runtime cost): `RefundedInput`, `BuyerErasureReport`, `DocumentTotals`, `MoneyBucket`

## Relationships

- **Imports from (sibling service files):** `issue-invoice.ts`, `issue-credit-note.ts`, `render.ts`, `for-caller.ts`, `stats.ts`, `reencrypt.ts`, `retention.ts`
- **Imported by (consumers):**
  - `module.ts` — registers services for the invoicing feature module
  - `index.ts` — module-level public API
  - Controllers: `get-order-invoice.ts`, `get-order-credit-note.ts`, `get-order-credit-notes.ts`
  - Tests: `issue-invoice.test.ts`, `retention.test.ts`, `shop.contract.test.ts`

## Notes

- This file intentionally contains **no logic** of its own — it is purely re-export + object assembly. Add new service functions to their own file, then wire them here.
- The file header doc-comment lists the three core flows (issue invoice, issue credit note, render PDF) as the module's primary responsibilities; all other exports are auxiliary.
- Consumers should prefer `invoicingService` over importing individual service files directly, keeping the dependency graph shallow and making it trivial to swap implementations in tests.
