---
source: src/modules/invoicing/services/personal-data.ts
sha256: 565e23d37ae4b5902034e849a38936bbf4ed9394b647aa898167f887462fe672
generated_at: 2026-10-14T16:09:58.750288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/personal-data.ts

## Purpose

Serves the invoicing module's slice of the `POST /account/export` endpoint by collecting every invoice and credit note tied to an account's own orders. It exists as a dedicated file so that `module.ts` can register it as the `personalData` handler without coupling that logic to the repository or presenter directly.

## Key elements

- **`collectPersonalData(userId: string)`** – The sole export. Resolves a `Promise<{ invoices: ExportedDocument[]; creditNotes: ExportedDocument[] }>` by:
  1. Calling `findOwnOrders(userId)` to obtain the account's order IDs.
  2. For each order, fetching its invoice and credit notes via `invoicingRepository`.
  3. Mapping results through `presentExportedDocument` before returning.
- No `erase` export is provided (see Notes).

## Relationships

- **`src/modules/invoicing/module.ts`** – Registers this file's `collectPersonalData` as the invoicing section of the personal-data export.
- **`src/modules/invoicing/presenter.ts`** – Supplies `presentExportedDocument` (shapes a raw document into the wire format) and the `ExportedDocument` return type.
- **`src/modules/invoicing/repository.ts`** – Provides `invoicingRepository.findInvoiceByOrderId` and `.findCreditNotesByOrderId` for the actual data lookups.
- **`src/modules/orders/index.ts`** – Re-exports `findOwnOrders`, which this file calls to resolve the user's order list before invoicing lookups.
- **`src/modules/orders/services/read.ts`** – Likely the implementation behind `findOwnOrders`; the invoicing module depends on the orders module's read path to obtain order IDs.

## Notes

- **No `erase`/GDPR-erasure function.** Neither the `invoices` nor `creditNotes` collection stores `userId`; both are keyed by `orderId`. Once `orders`' own `detachUserId` severs the order-level link, there is nothing left to unlink here. This is the same Art. 17(3)(b)/(e) retention exemption documented in `orders/model.ts`'s `userId` field comment.
- **Invoice is 0-or-1 per order; credit notes are many.** The flatMap for invoices guards with a truthy check (`invoice ? [ … ] : []`), while credit notes are mapped unconditionally.
- The function is a plain promise chain (no `async`/`await`); keep that style consistent if extending.
