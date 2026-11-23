---
source: src/modules/orders/controllers/post-order-restore.ts
source_sha256: 2e16fadc23407f1461688eec1f622269a1bcc10cd2a402469cf4fc4fb00cce6c
context_sha256: 65fa57ceb8be06101b933fa4056feec011e89cf247d5097d379dc3d47f22134d
generated_at: 2026-11-22T06:09:46.240972+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/post-order-restore.ts

## Purpose
Admin controller for `POST /orders/:id/restore`, which undoes a soft delete of an order. It contains no logic of its own. It configures the shared `createRestoreController` factory for the order entity.

## Key elements
- **`restoreOrders`**: the exported controller, built by `createRestoreController` with these options:
  - `entity: 'order'`
  - `restore`: calls `orderService.restoreById(id, callerContextOf(request))`.
  - `present`: formats the restored order with `orderService.withActions(order, request.authContext)`.
  - `notFoundKey: 'orders.not-found'`
  - `basePath: '/orders'`

## Relationships
- **`src/infrastructure/surfaces/create-restore-controller.ts`**: provides the factory that does the actual restore handling. This file only supplies the order-specific options.
- **`src/infrastructure/http/request.ts`**: `callerContextOf` builds the caller context passed to the service from the request.
- **`src/modules/orders/services/index.ts`**: `orderService` supplies `restoreById` and `withActions`.
- **`src/modules/orders/routes.ts`**: the neighboring routes module, which presumably registers `restoreOrders`. The registration is not visible in this file.

## Notes
- The route returns 409 when the order is not deleted.
- `orderService.restoreById` is responsible for emitting the `ORDER_RESTORED` audit event. The controller does not emit it.
