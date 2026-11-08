---
source: src/modules/orders/controllers/post-order-restore.ts
sha256: 98ea67d19f7966aca79792dddc09c9cd4e7180bac88e0d9deca7ccd380ef022c
generated_at: 2026-11-08T06:46:59.969775+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-order-restore.ts

## Purpose

Thin controller wiring that exposes an admin `POST /orders/:id/restore` endpoint. It delegates all real work to the shared `createRestoreController` factory and the `orderService`, so the file itself contains no business logic—only the binding of entity name, service calls, and a 404 message key.

## Key elements

- **`restoreOrders`** (export) — The controller handler produced by `createRestoreController`. Configured with:
  - `entity: 'order'`
  - `restore` — calls `orderService.restoreById(id, callerContextOf(request))`; owns the `ORDER_RESTORED` audit emit.
  - `present` — calls `orderService.withActions(order, request.authContext)` to shape the response body.
  - `notFoundKey: 'orders.not-found'` — i18n key returned on 404.

## Relationships

- **`src/infrastructure/surfaces/create-restore-controller.ts`** — Factory that encapsulates the common restore flow (404 check, 409 "not deleted" check, success response). This file supplies the entity-specific callbacks.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, extracted from the incoming request and passed to `orderService.restoreById` for audit/permission context.
- **`src/modules/orders/services/index.ts`** — Exports `orderService`, whose `restoreById` and `withActions` methods are the only domain calls this controller makes.
- **`src/modules/orders/routes.ts`** — Registers `restoreOrders` on the `POST /orders/:id/restore` route.

## Notes

- Returns **409** (not 400/422) when the order is not in a deleted state—handled inside the factory, not here.
- The audit event (`ORDER_RESTORED`) is emitted by `orderService.restoreById`, not by this controller or the factory.
- Auth is expected to be enforced upstream (route-level or middleware); this file reads `request.authContext` only for the `withActions` presentation step.
