---
source: src/modules/invoicing/services/personal-data.ts
source_sha256: b256c683e1da7027f62717a39305f6596d5da15c9be0b2db110f0337aee036fc
context_sha256: e19894894df7975ef32a6dfdf4be18c843342e2627f6dd7ff56e49ad3d0b00b1
generated_at: 2026-11-22T05:36:12.139855+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/personal-data.ts

## Purpose
Provides the invoicing module's section of the `POST /account/export` personal-data export (wired in via `personalData` in `module.ts`). It gathers every invoice and credit note issued for an account's orders. It defines no `erase` step: neither collection stores `userId`, only `orderId`, so there is nothing to unlink once `orders` has detached the `userId` from the order. This follows the Art. 17(3)(b)/(e) retention exemption documented in `src/modules/orders/model.ts`.

## Key elements
- `collectPersonalData(userId)`: the only export. It returns `Promise<{ invoices: ExportedDocument[]; creditNotes: ExportedDocument[] }>`.
  1. Calls `orderService.findOwnOrders(userId)` to get the account's orders.
  2. For each order, in parallel, calls `invoicingRepository.findInvoicesByOrderId` and `findCreditNotesByOrderId`.
  3. Flattens the results and maps each document through `presentExportedDocument`.

## Relationships
- `../repository`: `invoicingRepository` supplies the per-order invoice and credit-note lookups.
- `../presenter`: supplies `presentExportedDocument` and the `ExportedDocument` type, which shape the exported output.
- `@modules/orders` (`orderService`): `findOwnOrders` is the only link from a user to their orders. This module does not store `userId`.
- `module.ts`: registers this function as the module's `personalData` export section.

## Notes
- All of an order's invoices are exported, including those cancelled by a correction, because each was issued to the buyer.
- Queries run per order (two per order, all in parallel), so the number of repository calls grows with the account's order count.
- Only orders returned by `findOwnOrders` are covered. Any order whose `userId` link has already been detached is not found through this path.
