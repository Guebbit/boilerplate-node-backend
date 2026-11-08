---
source: src/modules/delivery/order-routes.ts
sha256: 0061d88f383c7f0a9ea4522addfe14c4090010adc90a61a6da577655e166a894
generated_at: 2026-11-08T05:31:52.763578+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/order-routes.ts

## Purpose

Defines the Express router for the three delivery operations that live under an order path (`/orders/:id/…`): starting fulfillment via `process`, and reading the order's fulfillment-orders and shipments lists. It exists to keep those routes colocated with the delivery module while still mounting under the `/orders` prefix.

## Key elements

- **`orderRouter`** (exported `Router`) – the single router instance; `./module.ts` mounts it at `/orders`.
- **`POST /:id/process`** – moves an order from `paid` → `processing`. Guarded by `getAuth → isAuth → requirePermission('start', 'Shipment')`, then delegates to `postProcessOrder`.
- **`GET /:id/fulfillment-orders`** – returns the caller's fulfillment orders for that order. Guarded by `getAuth → isAuth → requirePermission('read', 'Order')`, then delegates to `getOrderFulfillmentOrders`.
- **`GET /:id/shipments`** – returns the caller's shipments for that order. Same auth chain and `read:Order` permission, delegates to `getOrderShipments`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** – supplies the three middleware functions (`getAuth`, `isAuth`, `requirePermission`) applied to every route in this file.
- **`src/modules/delivery/controllers/get-order-fulfillment-lists.ts`** – provides the two GET handlers (`getOrderFulfillmentOrders`, `getOrderShipments`).
- **`src/modules/delivery/controllers/post-process-order.ts`** – provides the POST handler (`postProcessOrder`).
- **`src/modules/delivery/module.ts`** – imports `orderRouter` and mounts it at the `/orders` path within the delivery module's Express app.
- **`src/modules/delivery/tests/unit/routes.test.ts`** – unit-tests the route definitions, middleware chain, and handler wiring in this file.

## Notes

- Naming convention: the verb in the URL names the **target** status (`process` → `processing`), not the current one. The module and its `start:Shipment` permission key stay in the delivery namespace.
- There is intentionally **no** `forced` variant of the process route; the comment notes that the admin override is the only other reachable path, so no step-up permission guard is needed here.
- The `read:Order` permission gates the GET routes at the route level, but actual row-level scoping to the caller's own orders is enforced **inside the service layer** (not visible in this file).
