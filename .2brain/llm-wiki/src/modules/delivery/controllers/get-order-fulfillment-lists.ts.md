---
source: src/modules/delivery/controllers/get-order-fulfillment-lists.ts
sha256: 2235240e824054808ae063e8f0f2a652cdca911e380f2e59446a116062740520
generated_at: 2026-11-08T05:26:35.130253+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-order-fulfillment-lists.ts

## Purpose

Provides the two HTTP handlers that power the order shipping panel: one returns the fulfillment orders (the plan) for a given order, the other returns the shipments cut from them (what left). Both are unpaged lists, expected to be small, and are only meaningful once the order is paid.

## Key elements

- **`getOrderFulfillmentOrders`** — Handles `GET /orders/:id/fulfillment-orders`. Extracts the order `id` via `requireId`, calls `deliveryService.listFulfillmentOrdersForOrder`, and responds with `{ items: FulfillmentOrder[] }`.
- **`getOrderShipments`** — Handles `GET /orders/:id/shipments`. Same pattern; calls `deliveryService.listShipmentsForOrder` and responds with `{ items: Shipment[] }`.

## Relationships

- **`@infrastructure/http/controller`** — Supplies `requireId` (param extraction + 404 short-circuit), `refused` (permission-denied short-circuit), and `catchAs` (error → HTTP status mapping).
- **`@infrastructure/http/response`** — Supplies `successResponse`, the canonical 200 wrapper used by both handlers.
- **`@infrastructure/http/ids`** — (imported via the controller module) provides the `requireId` helper that reads and validates the `:id` route param.
- **`src/modules/delivery/services/index.ts`** — Source of `deliveryService`; the two methods actually queried here are `listFulfillmentOrdersForOrder` and `listShipmentsForOrder`.
- **`src/modules/delivery/order-routes.ts`** — Registers these two exports as the route handlers for their respective paths.
- **`@types`** — Provides the `FulfillmentOrder` and `Shipment` type definitions used in response generics.

## Notes

- Both handlers are structurally identical; the only differences are the service method called, the response type, and the `catchAs` label string (used for error-log attribution).
- `requireId` is given the i18n key `'delivery.order-not-found'`; a missing/invalid `id` short-circuits before any service call.
- The `refused` guard sits between the service call and the success path, so permission failures never leak into the catch handler.
