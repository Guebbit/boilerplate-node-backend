---
source: src/modules/delivery/controllers/get-fulfillment-order.ts
sha256: f4682d2b3d4ebd3a607f2d5190b262e262c0c4eddddf2c213e183500707b4e7b
generated_at: 2026-10-29T03:31:25.226175+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-fulfillment-order.ts

## Purpose

Express route handler for `GET /delivery/fulfillment-orders/:id`. Extracts the order ID, delegates to the delivery service, and returns a single `FulfillmentOrder` to the authenticated buyer or to staff who can view all orders.

## Key elements

- **`getFulfillmentOrder`** (exported) — The sole handler. Validates the `:id` param, calls `deliveryService.getFulfillmentOrder(id, request.authContext)`, and either returns the order body or short-circuits on a refusal / missing ID.

## Relationships

- **`@infrastructure/http/ids`** → `requireId` extracts and validates the `:id` param; returns early with a 404 (`delivery.fulfillment-order-not-found`) if absent or malformed.
- **`@infrastructure/http/response`** → `successResponse` wraps the `FulfillmentOrder` payload in the standard success envelope.
- **`@infrastructure/http/controller`** → `refused` checks whether the service returned a permission denial (e.g. buyer accessing another user's order) and emits the appropriate 403; `catchAs` formats unexpected errors into the standard error response.
- **`../services`** → `deliveryService.getFulfillmentOrder` performs the actual lookup, scoped by `request.authContext`.
- **`@types`** → `FulfillmentOrder` is the shape of the returned data.
- **`src/modules/delivery/routes.ts`** — Registers this handler on the delivery router (the route is documented in the module JSDoc).

## Notes

- The early `if (!id) return Promise.resolve()` branch exists so the function's return type stays `Promise<void>` without an explicit `undefined` path; it is not a no-op in the Express sense — `requireId` has already sent the 404 response.
- Authorization is not enforced in the controller; the service layer decides visibility based on `request.authContext` and signals denial via the `refused` contract.
