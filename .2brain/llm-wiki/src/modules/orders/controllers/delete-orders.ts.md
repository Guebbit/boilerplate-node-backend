---
source: src/modules/orders/controllers/delete-orders.ts
source_sha256: 8464a4fba8dd6e83c7df10e4fddc68de182097aff0c3bbdb2e67acf8315dac1c
context_sha256: bd2671186645627996f8714e06a41c39bc7b2f6f2205211ca2d272e23ec3356e
generated_at: 2026-11-22T06:08:15.234158+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/delete-orders.ts

## Purpose
Admin delete controller for orders. It is thin wiring that plugs the orders service into the shared `createDeleteController` factory, so the order module gets a `DELETE /orders(/:id)(/hard)` handler without implementing its own request handling.

## Key elements
- `deleteOrders` (exported const): controller built by `createDeleteController` with:
  - `entity: 'order'`
  - `remove(id, hardDelete, request)`, which calls `orderService.removeById(id, hardDelete, callerContextOf(request))`
  - `notFoundKey: 'orders.not-found'`, the message key used when the order doesn't exist

## Relationships
- **`src/infrastructure/surfaces/create-delete-controller.ts`**: supplies the factory that implements the controller behavior. This file only passes in the entity name, the `remove` callback and the not-found key.
- **`src/infrastructure/http/request.ts`**: `callerContextOf` derives the caller context from the request, and that context is passed to the service.
- **`src/modules/orders/services/index.ts`**: provides `orderService`, whose `removeById` performs the deletion.
- **`src/modules/orders/routes.ts`**: the orders routes presumably mount `deleteOrders`. The routes file's contents aren't shown here, so that is inferred from the neighbor relationship.

## Notes
- Soft delete is the default. `?hardDelete=true` or the `/hard` path suffix makes the delete permanent.
- Hard delete releases the order's held units first. Soft delete only moves the deletion stamp, because an order is a financial record.
- `orderService.removeById` owns emitting the `ORDER_DELETED` audit event. The controller does not emit it.
