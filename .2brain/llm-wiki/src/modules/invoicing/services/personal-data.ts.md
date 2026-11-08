---
source: src/modules/invoicing/services/personal-data.ts
sha256: 55206a5add32508041665cadaad469f23ca163c5bee6819da5b3b60c410024b2
generated_at: 2026-11-08T06:15:20.375170+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/personal-data.ts

## Purpose

Implements the invoicing module's contribution to `POST /account/export`. Given a `userId`, it gathers every invoice and credit note tied to that account's orders and returns them in export-ready shape. It is the `personalData` handler referenced by the module's route registration.

## Key elements

- **`collectPersonalData(userId)`** — the sole export. Resolves the user's order IDs via `orderService.findOwnOrders`, then fans out to `invoicingRepository` for the invoice and credit notes per order ID, and finally maps each raw record through `presentExportedDocument`. Returns `{ invoices: ExportedDocument[], creditNotes: ExportedDocument[] }`.

## Relationships

- **`src/modules/invoicing/module.ts`** — registers this file's `collectPersonalData` as the invoicing section of the `/account/export` handler.
- **`src/modules/invoicing/repository.ts`** — provides `invoicingRepository.findInvoiceByOrderId` and `.findCreditNotesByOrderId`, the two lookups this file calls.
- **`src/modules/invoicing/presenter.ts`** — supplies the `presentExportedDocument` formatter and the `ExportedDocument` type used for the return value.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/services/index.ts`** — provides `orderService.findOwnOrders(userId)`, the first step that yields the order IDs needed for the invoicing queries.

## Notes

- There is intentionally **no `erase` counterpart**. Neither the invoices nor credit-notes collection stores a `userId`; both are keyed only by `orderId`. Once `orders` performs its own `detachUserId`, the link is already broken, so there is nothing further to unlink here.
- The GDPR Art. 17(3)(b)/(e) retention exemption for the order's `userId` field is documented in `orders/model.ts`, not here.
