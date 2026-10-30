---
source: src/modules/invoicing/services/personal-data.ts
sha256: 55206a5add32508041665cadaad469f23ca163c5bee6819da5b3b60c410024b2
generated_at: 2026-10-29T04:15:14.544836+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/personal-data.ts

## Purpose

Implements the invoicing module's contribution to the `POST /account/export` endpoint (GDPR personal-data export). It gathers all invoices and credit notes belonging to an account by walking through that account's orders, since neither the invoice nor credit-note collections are keyed by `userId`.

## Key elements

- **`collectPersonalData(userId: string)`** — The sole export. Resolves the user's orders via `orderService.findOwnOrders`, then for each order queries `invoicingRepository.findInvoiceByOrderId` and `findCreditNotesByOrderId`. Flattens the results and maps each document through `presentExportedDocument` into the `{ invoices, creditNotes }` shape the export handler expects.
- **No `erase` export** — Deliberately absent. Both collections store only `orderId`, not `userId`, so the orders module's own `detachUserId` step already severs the link; there is nothing left to unlink here (Art. 17(3)(b)/(e) retention exemption).

## Relationships

- **`src/modules/invoicing/module.ts`** — Registers `collectPersonalData` as the `personalData` handler for the export route. This file is the implementation behind that registration.
- **`src/modules/invoicing/presenter.ts`** — Provides the `presentExportedDocument` mapper and the `ExportedDocument` type used to shape each invoice/credit-note record for the export response.
- **`src/modules/invoicing/repository.ts`** — Source of `invoicingRepository`, which supplies `findInvoiceByOrderId` and `findCreditNotesByOrderId` used for the per-order lookups.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — Source of `orderService.findOwnOrders(userId)`, the first hop that resolves which order IDs belong to the requesting account.

## Notes

- The function issues **one repository call pair per order** (N+1 pattern). If an account has many orders this produces many round-trips; batch-query alternatives would require repository changes.
- `presentExportedDocument` is applied uniformly to both invoices and credit notes — the presenter is responsible for any field-level differences between the two document shapes.
- The absence of an `erase` function is intentional and documented in the module-level comment; do not add one without revisiting the retention-exemption rationale in `orders/model.ts`.
