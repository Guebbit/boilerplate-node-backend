# src/modules/orders/controllers/delete-orders.ts

## Purpose

Thin controller factory for the admin-only "delete order" endpoints. It wires the generic `createDeleteController` infrastructure to the order domain, delegating the actual removal to `orderService` and recording the action in the audit log. The file exists so that route registration (in `routes.ts`) only needs to import a ready-made handler rather than assembling delete logic inline.

## Key elements

- **`deleteOrders`** (exported const) — The only export. Built by `createDeleteController` with:
  - `entity: 'order'` — tells the generic controller which resource name to use for messages/logging.
  - `remove(id, hardDelete)` — Callback that forwards to `orderService.removeById(id, hardDelete)`. The second argument is a boolean that toggles soft vs. hard deletion.
  - `auditAction: ordersAuditActions.ORDER_DELETED` — The audit-log action recorded on every successful delete.
  - `notFoundKey: 'orders.not-found'` — i18n key for the 404 response body.

## Relationships

- **`src/infrastructure/http/delete-controller.ts`** — Provides `createDeleteController`, the generic factory that builds a delete handler (body-id, path-id, `/hard` variant, `?hardDelete` query param) from the options object passed here.
- **`src/modules/orders/service.ts`** — Supplies `orderService.removeById`, the actual deletion logic (soft-delete by default; hard-delete releases held units before destroying the row).
- **`src/modules/orders/audit.ts`** — Exposes `ordersAuditActions.ORDER_DELETED`, the enum value stamped into the audit trail.
- **`src/modules/orders/routes.ts`** — Consumes `deleteOrders` to register the three DELETE routes (`/orders`, `/orders/:id`, `/orders/:id/hard`) on the router.

## Notes

- All three route variants are **admin-only** (per the doc comment); authorization is presumably enforced upstream (middleware or route guard in `routes.ts`), not in this file.
- The soft path is the intended default for orders because they are financial records — the row is kept and only a deleted-at stamp moves. The hard path is a destructive escape hatch that also releases units still held by the order.
- The `id` can arrive via request **body** (no-path variant) or via **path parameter** (the two `/:id` variants); the controller factory handles both.
