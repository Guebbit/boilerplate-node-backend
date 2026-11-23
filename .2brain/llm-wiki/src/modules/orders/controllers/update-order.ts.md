---
source: src/modules/orders/controllers/update-order.ts
source_sha256: 66f9afe3c954ec21785f3727f9f51587a9b609a01ec466f30fef8cb4843956f3
context_sha256: a1ad6b7e25208c202661d507f807688e5aa620b1a3900ad8a7f4d6ae98f7185a
generated_at: 2026-11-22T06:10:24.770583+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/update-order.ts

## Purpose
Defines the HTTP controllers for `PUT /orders/:id` (replace) and `PATCH /orders/:id` (merge). Both are produced by the shared `createUpdateController` factory and delegate to the order service. `email` is the only writable field on either verb; `status` changes only through an action endpoint, not through this body.

## Key elements
- `replaceOrderById` — the `PUT` handler, validated against `ReplaceOrderByIdBody`.
- `updateOrderById` — the `PATCH` handler, validated against `UpdateOrderByIdBody`.
- Both are destructured from a single `createUpdateController` call configured with:
  - `versioned: true`
  - `entity: 'orderById'`
  - `notFoundKey: 'orders.not-found'`
  - `update`: calls `orderService.updateById(id, changes, callerContextOf(request))`
  - `present`: calls `orderService.withActions(order, request.authContext)` to shape the response

## Relationships
- `src/infrastructure/surfaces/create-update-controller.ts` — supplies the factory that builds both handlers from the schemas and callbacks given here.
- `src/modules/orders/services/index.ts` — supplies `orderService`. `updateById` does the update and `withActions` decorates the result for the response.
- `src/infrastructure/http/request.ts` — supplies `callerContextOf`, which derives the caller context passed to `updateById`.
- `src/modules/orders/routes.ts` — the neighboring routes module. The handlers are exported here for it to use, though the controller file itself does not reference it.

## Notes
- `orderService.updateById` already handles the 404 check and the audit emit, so the controller adds neither.
- The request body schemas (`ReplaceOrderByIdBody`, `UpdateOrderByIdBody`) come from `@api/schemas.zod`.
