---
source: src/modules/orders/controllers/restore-orders.ts
sha256: 98ea67d19f7966aca79792dddc09c9cd4e7180bac88e0d9deca7ccd380ef022c
generated_at: 2026-10-15T11:00:36.878208+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/restore-orders.ts

## Purpose

Thin admin controller that wires the shared `createRestoreController` factory to the order domain, exposing a single POST endpoint to undo a soft-deleted order.

## Key elements

- **`restoreOrders`** (exported const) — The sole export. A controller instance built by `createRestoreController` with:
  - `entity: 'order'` — used by the factory for logging/error shaping.
  - `restore` — delegates to `orderService.restoreById(id, callerContextOf(request))`.
  - `present` — passes the restored order through `orderService.withActions(order, request.authContext)` for action/permission decoration before serialization.
  - `notFoundKey: 'orders.not-found'` — i18n key for the 404 response.

## Relationships

- **`src/infrastructure/surfaces/create-restore-controller.ts`** — Supplies the factory that assembles the restore endpoint (route method, 404/409 handling, response envelope) from the config object passed here.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, which extracts the authenticated caller's identity for the service-layer restore call.
- **`src/modules/orders/services/index.ts`** — Provides `orderService.restoreById` (performs the restore, owns the `ORDER_RESTORED` audit emit) and `orderService.withActions` (attaches allowed-action metadata to the response payload).
- **`src/modules/orders/routes.ts`** — Imports and mounts `restoreOrders` at the orders route table (POST `/orders/:id/restore`).

## Notes

- Returns **409** (not 400/404) when the target order is *not* in a deleted state — the "not deleted" case is a conflict, not a not-found.
- Audit logging (`ORDER_RESTORED`) is the service's responsibility; this controller performs no logging itself.
- The `present` callback receives `request.authContext` directly (not via `callerContextOf`), whereas the `restore` callback uses `callerContextOf(request)`. Both derive from the request but through slightly different accessors.
