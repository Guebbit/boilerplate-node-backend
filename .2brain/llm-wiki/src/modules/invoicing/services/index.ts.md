---
source: src/modules/invoicing/services/index.ts
source_sha256: 20c980121995a4f31763ffea36cbc319f4c9e0706f0caa39c540dc230c8a9dc2
context_sha256: bc73cd6b183975d61e5a67158c49d96643c30814c29eab6e23059228cd5f602d
generated_at: 2026-11-22T05:35:13.648461+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/index.ts

## Purpose
Barrel file for the invoicing module's service layer. It gathers every invoicing operation into a single `invoicingService` object so controllers, event listeners, sibling modules and tests all reach the module through one entry point.

## Key elements
- `invoicingService`: the exported object that bundles these operations:
  - `issueInvoice`, `findInvoiceForOrder` (from `issue-invoice.ts`): freeze an invoice off `ORDER_STATUS_CHANGED` and look it up by order.
  - `findCreditNotesForOrder`, `findCreditNoteForOrderById` (from `issue-credit-note.ts`): read credit notes. The module doc says credit notes are frozen per refund off `PAYMENT_REFUNDED`.
  - `invoiceForCaller`, `creditNotesForCaller`, `creditNoteForCaller` (from `for-caller.ts`): caller-scoped variants of the lookups.
  - `renderInvoicePdf`, `renderCreditNotePdf` (from `render.ts`): produce PDF bytes through the e-invoicing port.
  - `moneyBuckets` (from `stats.ts`): money aggregation.
  - `reencryptInvoices` (from `reencrypt.ts`): re-encryption of invoices.
  - `eraseDueBuyers` (from `retention.ts`): buyer erasure.
- Type re-exports: `RefundedInput` (`issue-credit-note`), `BuyerErasureReport` (`retention`), `DocumentTotals` and `MoneyBucket` (`stats`).

## Relationships
- Imports from and re-exports the sibling service files: `issue-invoice.ts`, `issue-credit-note.ts`, `render.ts`, `for-caller.ts`, `stats.ts`, `reencrypt.ts` and `retention.ts`.
- The controllers `get-order-invoice.ts`, `get-order-credit-note.ts` and `get-order-credit-notes.ts` are graph neighbors, as are `module.ts` and the invoicing `index.ts`. They sit on the consuming side of this service.
- The integration tests (`issue-invoice.test.ts`, `correct-invoice.test.ts`) and the account module's `shop.contract.test.ts` are also neighbors. The file's own comment says tests reach the module through this one place.

## Notes
- It contains no logic of its own, only imports and the object. New operations have to be imported and added to `invoicingService` to be exposed.
- The type exports are separate `export type` lines, so they exist only at the type level.
