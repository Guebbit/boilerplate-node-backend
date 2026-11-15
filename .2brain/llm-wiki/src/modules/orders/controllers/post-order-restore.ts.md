---
source: src/modules/orders/controllers/post-order-restore.ts
sha256: 2e16fadc23407f1461688eec1f622269a1bcc10cd2a402469cf4fc4fb00cce6c
generated_at: 2026-11-14T20:33:10.088621+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-order-restore.ts

## Purpose

Thin admin-facing controller that exposes the "restore a soft-deleted order" endpoint (`POST /orders/:id/restore`). All business logic and audit side-effects live in the order service; this file only wires the shared `createRestoreController` factory to the order-specific service methods.

## Key elements

- **`restoreOrders`** (named export) — The controller handler produced by `createRestoreController`. Handles the restore request, delegates to the service, and returns the presented order. Returns **409** when the order is not in a deleted state.
- **`restore` callback** — Calls `orderService.restoreById(id, callerContextOf(request))`. The service owns emitting the `ORDER_RESTORED` audit event.
- **`present` callback** — Calls `orderService.withActions(order, request.authContext)` to attach role-appropriate action metadata to the response payload.
- **`notFoundKey: 'orders.not-found'`** — i18n key used for the 404 response when no order matches the given id.
- **`basePath: '/orders'`** — Prefix the factory uses to build the route path.

## Relationships

- **`src/infrastructure/surfaces/create-restore-controller.ts`** — Provides the `createRestoreController` factory that `restoreOrders` is built from. The factory encapsulates the standard not-found / not-deleted / restore / present flow.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, used to pass caller identity into the service call.
- **`src/modules/orders/services/index.ts`** — Exports `orderService`, which this file calls for both the restore operation and the response presentation.
- **`src/modules/orders/routes.ts`** — Registers the `POST /orders/:id/restore` route and maps it to the `restoreOrders` handler exported here.

## Notes

- This file is intentionally a one-liner of configuration passed into the factory; do **not** add branching or domain logic here—extend the order service instead.
- The 409 (not-deleted) guard is handled inside the shared factory, not in this file.
- The `ORDER_RESTORED` audit event is emitted inside the service; there is no duplicate emit at the controller layer.
