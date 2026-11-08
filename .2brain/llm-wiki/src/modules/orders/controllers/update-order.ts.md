---
source: src/modules/orders/controllers/update-order.ts
sha256: 66f9afe3c954ec21785f3727f9f51587a9b609a01ec466f30fef8cb4843956f3
generated_at: 2026-11-08T06:47:45.665939+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/update-order.ts

## Purpose

Builds the two HTTP handlers for `PUT /orders/:id` (full replace) and `PATCH /orders/:id` (partial merge) by delegating to the shared `createUpdateController` factory. The only writable field exposed through either verb is `email`; `status` transitions are intentionally excluded from the request body and must go through a dedicated action endpoint.

## Key elements

- **`replaceOrderById`** — The `PUT` handler. Accepts a `ReplaceOrderByIdBody` (full body), delegates to `orderService.updateById`, and returns the order decorated with its available actions.
- **`updateOrderById`** — The `PATCH` handler. Accepts an `UpdateOrderByIdBody` (partial body) with the same downstream flow.
- Both are produced in a single `createUpdateController` call configured with `versioned: true`, entity key `'orderById'`, not-found message key `'orders.not-found'`, and the two Zod schemas that gate the request shapes.

## Relationships

- **`create-update-controller.ts`** — Supplies the `createUpdateController` factory that assembles the replace/update handler pair, handles 404s, and wires schema validation.
- **`services/index.ts`** — Provides `orderService.updateById` (performs the write, 404 check, and audit emit) and `orderService.withActions` (attaches the list of permissible actions to the response given the caller's auth context).
- **`request.ts`** — Provides `callerContextOf(request)`, which extracts the authenticated caller's context and passes it into the service call.
- **`routes.ts`** — Imports `replaceOrderById` / `updateOrderById` and registers them against the `PUT`/`PATCH /orders/:id` routes.

## Notes

- The `present` callback calls `orderService.withActions(order, request.authContext)`, so the response shape includes a per-user `actions` array; the controller itself adds no business logic beyond routing the request to the service.
- `status` is deliberately absent from both `ReplaceOrderByIdBody` and `UpdateOrderByIdBody`; attempting to set it via this endpoint will be rejected at schema validation. Status changes belong to a separate action route.
