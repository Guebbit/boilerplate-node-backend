---
source: src/modules/delivery/order-routes.ts
sha256: 9abd87dfe90187eb3572b686652122b065830d706b0a41d4ed98f0bd39293f56
generated_at: 2026-10-29T03:35:58.491564+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/order-routes.ts

## Purpose

Defines the Express router for delivery operations mounted under `/orders`. It wires three routes—order processing and the two fulfilment-list lookups—to their respective controllers, applying the shared auth/permission middleware chain to each. It exists to keep route declarations, middleware ordering, and permission keys in one place so `module.ts` can mount them as a unit.

## Key elements

- **`orderRouter`** (exported `Router`) – the sole export; an Express `Router` instance that the module mounts at `/orders`.
- **`POST /:id/process`** – chain: `getAuth → isAuth → requirePermission('start','Shipment') → postProcessOrder`. Transitions an order from `paid` to `processing`.
- **`GET /:id/fulfillment-orders`** – chain: `getAuth → isAuth → requirePermission('read','Order') → getOrderFulfillmentOrders`.
- **`GET /:id/shipments`** – chain: `getAuth → isAuth → requirePermission('read','Order') → getOrderShipments`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** – provides `getAuth`, `isAuth`, and `requirePermission`, which are applied as middleware on every route in this file.
- **`src/modules/delivery/controllers/get-order-fulfillment-lists.ts`** – supplies the two GET handlers (`getOrderFulfillmentOrders`, `getOrderShipments`).
- **`src/modules/delivery/controllers/post-process-order.ts`** – supplies the POST handler (`postProcessOrder`).
- **`src/modules/delivery/module.ts`** – imports `orderRouter` and mounts it at the `/orders` path.
- **`src/modules/delivery/tests/unit/routes.test.ts`** – unit-tests the route definitions, middleware ordering, and permission keys declared here.

## Notes

- Permission keys are deliberately narrow: the POST route uses `start:Shipment` (a delivery-module key), while the GET routes use `read:Order` (an order-module key). The comment notes the service layer further scopes results to the caller's own orders, so the route-level check is a coarse gate.
- The `process` route has no `forced` variant and therefore no step-up (second-factor) guard; the comment clarifies that the admin override is a separate reachable path elsewhere.
- Route order matters: `/:id/process` is registered before the two GET routes, but because the HTTP method differs there is no collision.
