---
source: src/modules/delivery/controllers/get-order-fulfillment-lists.ts
sha256: 2235240e824054808ae063e8f0f2a652cdca911e380f2e59446a116062740520
generated_at: 2026-10-29T03:31:32.700121+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-order-fulfillment-lists.ts

## Purpose

Provides two Express controller handlers for the order shipping panel: listing an order's fulfillment orders (the fulfillment plan) and the shipments cut from them (what has shipped). Both are unpaged by design—a single order carries only a handful of each. The endpoints return empty lists until the order is paid.

## Key elements

- **`getOrderFulfillmentOrders`** — `GET /orders/:id/fulfillment-orders`. Validates the route `id`, calls `deliveryService.listFulfillmentOrdersForOrder`, and returns `{ items: FulfillmentOrder[] }`.
- **`getOrderShipments`** — `GET /orders/:id/shipments`. Same flow but calls `deliveryService.listShipmentsForOrder` and returns `{ items: Shipment[] }`.

Both handlers share an identical shape: `requireId` → service call → `refused` check → `successResponse` → `catchAs` fallback.

## Relationships

- **`@infrastructure/http/response`** — `successResponse` wraps the payload into the standard HTTP success envelope.
- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:id` route param, short-circuiting with a 404 on failure.
- **`@infrastructure/http/controller`** — `catchAs` converts thrown/async errors into a standard error response; `refused` checks the service result and emits the appropriate rejection response.
- **`src/modules/delivery/services/index.ts`** — `deliveryService` is the single service dependency; both handlers delegate their data-fetching to it.
- **`src/modules/delivery/order-routes.ts`** — Registers these two handlers on their respective routes (not shown in this file but implied by the dependency).
- **`@types`** — Imports the `FulfillmentOrder` and `Shipment` domain types used in the response payloads.

## Notes

- Both handlers return `Promise.resolve()` early when `requireId` fails—callers must not expect a response to have been sent by the time the returned promise settles in that branch (the 404 was already sent synchronously by `requireId`).
- The `id` param is typed as `id?: string` on the `Request` generic; the actual non-undefined guarantee comes from the `requireId` guard.
- No pagination logic exists in this file; the contract is "all items for one order" and the module docblock states this is intentional.
