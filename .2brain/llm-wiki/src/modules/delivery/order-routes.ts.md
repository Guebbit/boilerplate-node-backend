---
source: src/modules/delivery/order-routes.ts
source_sha256: a6e1729ba326456180fac33120c4c8377e777f5a9aa11cfdea49f2d791b73764
context_sha256: 0fd7a468d23941c6031b6f66d059bf96329ade01dc7ed90f499f4d3b8f19c1cd
generated_at: 2026-11-22T04:51:11.381089+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/order-routes.ts

## Purpose
Defines the Express router for delivery operations that live under an order's URL: `POST /orders/:id/process` and two GET lists of the order's fulfillment data. The URL belongs to the order (the verb names the status reached, e.g. `process` → `processing`), while the module and its narrow `start:Shipment` permission key stay delivery's. It is mounted at `/orders` by `./module.ts`.

## Key elements
- `orderRouter` — the exported Express `Router` holding all three routes.
- `POST /:id/process` — begins fulfillment, moving the order `paid` → `processing`. Middleware chain: `getAuth`, `isAuth`, `requirePermission('start', 'Shipment')`, then `postProcessOrder`.
- `GET /:id/fulfillment-orders` — handled by `getOrderFulfillmentOrders`, guarded by `getAuth`, `isAuth`, `requirePermission('read', 'Order')`.
- `GET /:id/shipments` — handled by `getOrderShipments`, with the same guard chain as above.

## Relationships
- `src/kernel/middlewares/authorizations.ts` — supplies `getAuth`, `isAuth` and `requirePermission`, used on every route.
- `src/modules/delivery/controllers/post-process-order.ts` — provides `postProcessOrder`, the handler for the process route.
- `src/modules/delivery/controllers/get-order-fulfillment-lists.ts` — provides `getOrderFulfillmentOrders` and `getOrderShipments`, the list handlers.
- `src/modules/delivery/module.ts` — mounts `orderRouter` at `/orders`.
- `src/modules/delivery/tests/unit/routes.test.ts` — unit tests for the routes.

## Notes
- The process step is optional: shipping from `paid` makes the same move itself.
- There is no `forced` variant of process, so there is no step-up guard. The admin override is the other reachable path.
- The list routes use `read:Order`, the key of the order the caller is asking about. Per the file's comments, the service scopes results to the caller's own orders; that scoping is not done in this file.
