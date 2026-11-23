---
source: src/modules/orders/audit.ts
source_sha256: 24b0c1aa74008877fb3d13f2dba537e7d931addd9686a52cf34c23a224bd396a
context_sha256: aa833ae6b96b01a81e5354abf5e3788b5c25a566c15aad0e57ac47682f83fd30
generated_at: 2026-11-22T06:07:44.776500+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/audit.ts

## Purpose
Declares the audit actions the orders module emits and registers them into the app-wide audit action union through TypeScript module augmentation, rather than a shared enum. Action names carry no `admin.`/`user.` prefix by default, because `actorRole` on each audit record already says who acted (e.g. `order.created` fires for both admin writes and customer checkouts). The only exceptions are actions that only staff can produce.

## Key elements
- `ordersAuditActions` – a `const` object mapping constant names to action strings:
  - Order lifecycle: `ORDER_CREATED` (`order.created`), `ORDER_UPDATED`, `ORDER_DELETED`, `ORDER_RESTORED`.
  - `ORDER_CANCELED` (`order.canceled`) – the one order write a customer performs. `metadata` carries `cause`, `refund` and `paid`.
  - `ORDER_STATUS_OVERRIDDEN` (`order.status_overridden`) – an admin skipped or corrected the normal lifecycle. `metadata` carries mode/from/to/reason.
  - Admin reads and exports: `ADMIN_ORDER_VIEWED` (`admin.order.viewed`), `ADMIN_ORDERS_EXPORTED` (`admin.orders.exported`). The export's `metadata` carries the filter and the row count, never a row.
  - Admin corrections: `ADMIN_ORDER_ADDRESS_CORRECTED`, `ADMIN_ORDER_BILLING_CORRECTED`.
  - Admin notes: `ADMIN_ORDER_NOTE_ADDED`, `ADMIN_ORDER_NOTE_DELETED`.
- `declare module '@infrastructure/observability/audit'` – augments `AuditActionMap` with an `orders` key. Its type is the union of the values of `ordersAuditActions`.

## Relationships
The neighbors listed are the files tied to this vocabulary:
- Services (`src/modules/orders/services/address.ts`, `billing.ts`, `cancel.ts`, `crud.ts`, `export.ts`, `override.ts`, `remove.ts`, `timeline.ts`) and `src/modules/orders/controllers/get-order.ts` are the order write, read and export paths that relate to these actions. The page does not show which service emits which action.
- Integration tests under `src/modules/orders/tests/integration/` (`billing-address`, `cancel`, `create-audit`, `delete-restore-audit`, `export`, `notes`) cover the audit behavior of these flows.
- Augments `@infrastructure/observability/audit`; the file's header refers to the same declare-by-augmentation pattern in another module's audit file.

## Notes
- Privacy convention in `metadata`: it never carries addresses, VAT numbers, export rows or note text. Notes record the entry id and the text's length only.
- `ADMIN_ORDER_VIEWED` has the `admin.` prefix because only the wide (staff) read produces it.
- These audit actions are distinct from the `cartCheckoutTotal`/`orderCreatedTotal` metrics, which count route requests, not audit-trail orders.
