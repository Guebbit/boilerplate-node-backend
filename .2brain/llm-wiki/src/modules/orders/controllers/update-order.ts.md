---
source: src/modules/orders/controllers/update-order.ts
sha256: affbdfe8d9c841a649de97d37c4b480c480ed764454d08ef67a2d67446ca659b
generated_at: 2026-09-27T15:08:35.453875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/update-order.ts

## Purpose

Thin handler layer for `PUT /orders/:id` (replace) and `PATCH /orders/:id` (merge). It wires the shared `createUpdateController` factory to the order service so the only writable field (`email`) can be set, while `status` changes are intentionally excluded and handled exclusively through a separate action endpoint.

## Key elements

- **`replaceOrderById`** — handler for `PUT /orders/:id`; validates the body against `ReplaceOrderByIdBody` and calls `orderService.updateById`.
- **`updateOrderById`** — handler for `PATCH /orders/:id`; validates against `UpdateOrderByIdBody` (partial) and delegates to the same service method.
- **`present` callback** — enriches the returned order by calling `orderService.withActions(order, request.authContext)`, attaching permitted action metadata.
- Both handlers are destructured from a single `createUpdateController` call with `entity: 'orderById'`.

## Relationships

- **`createUpdateController`** (`src/infrastructure/surfaces/create-update-controller.ts`) — provides the factory that produces the PUT/PATCH pair, schema validation wiring, and HTTP-status mapping.
- **`orderService`** (`src/modules/orders/services/index.ts`) — the actual business logic: `updateById` performs the write (including 404 and audit-log emit); `withActions` decorates the response.
- **`callerContextOf`** (`src/infrastructure/http/request.ts`) — extracts caller identity/context from the incoming `request` object so the service can scope permissions or log attribution.
- **`src/modules/orders/routes.ts`** — registers `replaceOrderById` and `updateOrderById` as the route handlers for the corresponding HTTP verbs.

## Notes

- `status` is **not** part of either body schema; attempting to set it here will be rejected by validation. Use the dedicated action endpoint instead.
- The `update` callback receives a generic `request` parameter solely to derive `callerContextOf(request)`; it does not inspect other request fields.
- The service owns the 404 response and audit emission — the controller adds no additional error handling for missing orders.
