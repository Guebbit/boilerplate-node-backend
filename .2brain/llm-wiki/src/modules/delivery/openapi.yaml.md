---
source: src/modules/delivery/openapi.yaml
sha256: 9dd1abaa8febc6736cfc0a3893b7a7d296e6d61a90f95eeee70efeac6b249a5c
generated_at: 2026-10-15T10:27:39.402206+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the delivery module. It defines the REST endpoints for shipping-method catalogue, order fulfilment lifecycle (start, ship, deliver, hold, release), and the admin preorder board. It also declares the module's error-code vocabulary and the sections it contributes to the account data export, so that the module can be added or removed without touching the shared root spec.

## Key elements

- **`x-error-codes`** — Extension block listing every delivery-specific error (409 state-conflicts like `DELIVERY_NOT_SHIPPABLE`, 422 validation errors like `DELIVERY_LINES_INVALID`). Consumed by the bundler to register codes globally.
- **`x-personal-data`** — Extension block defining the `shipments` and `fulfillmentOrders` arrays that the bundler injects into `POST /account/export`. Removing this module removes those sections.
- **`GET /delivery/methods`** — Public catalogue of shipping methods (flat rates, free-above thresholds). Not a quote; authoritative pricing lives in cart and checkout.
- **`GET /delivery/order/{orderId}`** — Returns the fulfillment orders and shipments for one order, with per-caller `actions`. Unpaid orders return empty lists rather than 404.
- **`POST /delivery/order/{orderId}/start`** — Transitions an order `paid → processing`. Uses a narrower `delivery.any.start` scope so warehouse staff don't need `orders.any.update`.
- **`GET /delivery/fulfillment-orders`** — The admin "preorder board": paginated list with filters for `preorder`, `state`, `productId`, `late`, `dueWithin`. Staff with `orders.any.read` see all rows; others see only their own.
- **`GET /delivery/fulfillment-orders/summary`** — Per-product unit breakdown across fulfillment states (paid, waiting-for-stock, allocated, shipped, cancelled, late) for the Products tab.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All shared response objects (`Unauthorized`, `NotFound`, `Forbidden`, `Conflict`, `ValidationError`, `InternalError`), common parameters (`PageParam`, `PageSizeParam`), and base schemas (`Id`) are `$ref`'d from this file. This module spec is composed into that root by the OpenAPI bundler.
- **`src/modules/cart/openapi.yaml`** — The `/delivery/methods` description cross-references `PUT /cart/shipping-method` as the authoritative pricing/weight-fit endpoint, signalling that cart is the downstream consumer of the method list.
- **`src/modules/delivery/module.ts`** — Registers this OpenAPI spec (and its routes/schemas) with the application at bootstrap, wiring the declared paths into the router.
- **`../orders/openapi.yaml`** (referenced inline) — `OrderIdPathParam` and `OrderEnvelope` are imported from the orders module for the per-order endpoints.

## Notes

- The file is the *contract* only; the truncated portion almost certainly contains the shipment-creation, deliver, hold/release, and per-fulfillment-order action endpoints implied by the `x-error-codes` list.
- `x-personal-data` keys (`shipments`, `fulfillmentOrders`) are the exact names the bundler looks up when assembling `AccountExportResponse`. Renaming them here without updating the bundler will silently drop export sections.
- The `listShippingMethods` endpoint is explicitly `security: []` (public). Do not add auth here; the design intent is that shipping costs are pre-purchase information.
- `holdNote` is a staff-only field; it is omitted from the response for non-staff callers. This filtering is server-side, not a schema change.
- Error codes use 409 for state-machine conflicts (order not in the right state) and 422 for payload validation (missing tracking code, invalid lines). Do not introduce 400s for these cases.
