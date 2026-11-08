---
source: src/modules/orders/controllers/delete-orders.ts
sha256: 8464a4fba8dd6e83c7df10e4fddc68de182097aff0c3bbdb2e67acf8315dac1c
generated_at: 2026-11-08T06:45:45.332494+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/delete-orders.ts

## Purpose

A thin admin delete controller for orders. It wires the shared `createDeleteController` factory to `orderService.removeById`, so the module's route can dispatch `DELETE /orders(/:id)(/hard)` without any bespoke HTTP logic living here.

## Key elements

- **`deleteOrders`** (named export) — the controller returned by `createDeleteController`. Accepts an entity id and an optional `hardDelete` flag (from the path segment or `?hardDelete=true`), then calls `orderService.removeById(id, hardDelete, callerContextOf(request))`.
- **`notFoundKey: 'orders.not-found'`** — i18n key used by the factory to shape the 404 response.

## Relationships

- **`@infrastructure/surfaces/create-delete-controller`** — supplies the factory that generates the router handler, request-parsing, and error-envelope logic. This file only provides the `entity`, `remove`, and `notFoundKey` configuration.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the authenticated caller's context and forwards it to the service layer.
- **`../services` (`orderService`)** — `orderService.removeById` performs the actual soft/hard deletion and emits the `ORDER_DELETED` audit event.
- **`src/modules/orders/routes.ts`** — registers `deleteOrders` on the `DELETE /orders(/:id)(/hard)` route.

## Notes

- Soft delete is the default; it only sets a deletion stamp because an order is a financial record. Hard delete additionally releases the order's held units before removing the row.
- All behavioral specifics (parsing, validation, error shape) live in the `createDeleteController` factory — this file is intentionally a one-liner of config.
- The `ORDER_DELETED` audit emission is the service's responsibility, not this controller's.
