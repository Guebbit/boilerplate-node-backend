---
source: src/modules/orders/controllers/delete-orders.ts
sha256: 8464a4fba8dd6e83c7df10e4fddc68de182097aff0c3bbdb2e67acf8315dac1c
generated_at: 2026-10-15T10:59:15.315507+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/delete-orders.ts

## Purpose

Thin adapter that wires the shared `createDeleteController` factory to the order-specific service. It exposes a single `deleteOrders` controller for the admin `DELETE /orders` endpoint, delegating all real logic to `orderService.removeById`.

## Key elements

- **`deleteOrders`** (exported const) — The controller instance produced by `createDeleteController`. Configured with:
  - `entity: 'order'`
  - `remove(id, hardDelete, request)` — calls `orderService.removeById(id, hardDelete, callerContextOf(request))`
  - `notFoundKey: 'orders.not-found'` — i18n key returned when no matching order is found

## Relationships

- **`@infrastructure/surfaces/create-delete-controller`** — Provides the `createDeleteController` factory; all HTTP plumbing (route matching, auth guard, response shaping) lives there.
- **`@infrastructure/http/request`** — Provides `callerContextOf(request)`, which extracts the authenticated caller identity passed into the service call.
- **`../services` (orders services barrel)** — Supplies `orderService.removeById`, which performs the actual soft/hard delete and emits the `ORDER_DELETED` audit event.
- **`../routes.ts`** — Registers `deleteOrders` on the admin router at `DELETE /orders(/:id)(/hard)`.

## Notes

- Soft delete is the default; hard delete is triggered by the `/hard` path suffix **or** `?hardDelete=true` query param.
- Hard delete releases the order's held inventory units before removing the record; soft delete only stamps a deletion flag (order is treated as an immutable financial record).
- The `ORDER_DELETED` audit event is emitted inside `orderService.removeById`, not in this controller.
