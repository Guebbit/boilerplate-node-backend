# src/modules/orders/controllers/delete-orders.ts

## Purpose

Thin wiring module that instantiates the orders delete controller via the shared `createDeleteController` factory. It exists to bind the generic delete surface (auth guard, 404 handling, audit logging) to the order-specific service call and audit action, keeping the domain logic in the service layer.

## Key elements

- **`deleteOrders`** (exported const) — The fully-wired controller returned by `createDeleteController`. Handles `DELETE /orders/:id` (soft by default) and `DELETE /orders/:id/hard` (permanent). Accepts `?hardDelete=true` as an alternative to the `/hard` suffix. Hard delete releases the order's held inventory units before removing; soft delete only stamps the record as deleted since an order is a financial record.

## Relationships

- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Provides the `createDeleteController` factory that this file calls with `entity`, `remove`, `auditAction`, and `notFoundKey` options. All HTTP-layer concerns (parsing the id, 404 response, audit emission) live in that factory.
- **`src/modules/orders/service.ts`** — Supplies `orderService.removeById(id, hardDelete)`, the actual domain operation invoked by the `remove` callback.
- **`src/modules/orders/audit.ts`** — Exports `ordersAuditActions.ORDER_DELETED`, the action key passed to the factory for the audit trail entry.
- **`src/modules/orders/routes.ts`** — Presumed mount point that imports `deleteOrders` and attaches it to the `DELETE /orders` route(s).

## Notes

- This file contains **no** business logic; it is purely configuration passed to the factory. Behavior changes (e.g., new delete variants) belong in `orderService` or the factory itself.
- Soft delete is the default because an order is treated as a **financial record**. Hard delete is the explicit, destructive path (`/hard` suffix or `?hardDelete=true`).
- The `notFoundKey` is `'orders.not-found'`, implying a localized/i18n error message is resolved elsewhere by the factory.
