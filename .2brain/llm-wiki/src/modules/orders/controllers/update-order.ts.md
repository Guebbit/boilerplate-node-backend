---
source: src/modules/orders/controllers/update-order.ts
sha256: 66f9afe3c954ec21785f3727f9f51587a9b609a01ec466f30fef8cb4843956f3
generated_at: 2026-10-15T11:00:45.884887+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/update-order.ts

## Purpose

Exports the `PUT /orders/:id` (replace) and `PATCH /orders/:id` (merge) handlers for the orders resource. Both are built from the shared `createUpdateController` factory so that validation, 404 handling, and response shaping stay consistent. Only `email` is a writable field here; `status` is deliberately excluded from both body schemas and must be changed via a separate action endpoint.

## Key elements

- **`replaceOrderById`** — `PUT` handler. Validates the body against `ReplaceOrderByIdBody`, delegates to `orderService.updateById`, and returns the order enriched with available actions.
- **`updateOrderById`** — `PATCH` handler. Same flow but validates against `UpdateOrderByIdBody` (a subset of fields, supporting partial merges).
- Both are destructured from a single `createUpdateController` call configured with `versioned: true`, `entity: 'orderById'`, and `notFoundKey: 'orders.not-found'`.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — supplies the `createUpdateController` factory that this file calls to build the handler pair.
- **`src/modules/orders/services/index.ts`** — provides `orderService`, whose `updateById` performs the actual mutation (including 404 check and audit emit) and whose `withActions` enriches the response payload.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, used to extract the authenticated caller's context and pass it into the service layer.
- **`src/modules/orders/routes.ts`** — the route table that wires `replaceOrderById` / `updateOrderById` to their respective HTTP methods and paths.

## Notes

- `status` is **not** part of either body schema by design. Attempting to set it through this endpoint will be rejected by the Zod schemas; the canonical path is a dedicated action endpoint.
- The `present` callback calls `orderService.withActions(order, request.authContext)`, so the response shape is richer than a plain order record—it includes a list of allowed actions computed from the caller's role.
- The 404 response uses the i18n key `orders.not-found`; the factory handles emitting it, so no manual 404 check lives in this file.
