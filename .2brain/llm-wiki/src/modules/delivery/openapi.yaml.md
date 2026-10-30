---
source: src/modules/delivery/openapi.yaml
sha256: e7e5eeff58c9bdbc1b329f75a2a8759c8df15a4659259c6b25728c95ba44e57b
generated_at: 2026-10-29T03:35:50.877701+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the delivery module. It defines the API surface for fulfillment orders, shipments, and shipping methods, plus the module's custom error codes and its contribution to the account data export. The spec is the single source of truth for what the delivery endpoints accept, return, and how they fail.

## Key elements

- **`x-error-codes`** — Module-specific error codes (`DELIVERY_LINES_INVALID` 422; `DELIVERY_NOT_SHIPPABLE`, `DELIVERY_NOT_PHYSICAL`, `DELIVERY_NOT_DIGITAL`, `DELIVERY_NOT_HOLDABLE`, `DELIVERY_NOT_RELEASABLE`, `DELIVERY_NOT_DELIVERABLE`, `DELIVERY_NOT_LOSABLE`, `DELIVERY_NOT_REOPENABLE`, `DELIVERY_LOST_SUPERSEDED`, `ORDER_NOT_PAID`, `ORDER_NOT_PROCESSING` — all 409). Each encodes a distinct business-rule violation the server can refuse.
- **`x-personal-data`** — Declares the `shipments` and `fulfillmentOrders` sections the bundler injects into `POST /account/export` (response schema `AccountExportResponse`). Removing this module removes those sections from the export.
- **`GET /delivery/methods`** — Public catalogue of all shipping methods (flat rates, free-above thresholds). Explicitly *not* a quote; authoritative pricing lives at `PUT /cart/shipping-method`.
- **`GET /orders/{id}/fulfillment-orders`** — List the fulfillment orders (groups of lines that leave together) for one order. Unpaged. Hold fields are scoped: buyer sees `holdNotice`, staff see `holdMessage`; `holdReason`/`holdNote` are staff-only.
- **`GET /orders/{id}/shipments`** — List shipments for one order, oldest first, with tracking code and delivered date. Unpaged.
- **`POST /orders/{id}/process`** — Transition an order `paid → processing`. Narrower than `update:Order`; grants `start:Shipment` without the full order-run permission.
- **`GET /delivery/fulfillment-orders`** — Admin "preorder board": paged, filterable by `cause` (preorder/backorder/any), `state`, `productId`, `late`, `dueWithin`. Returns rows sorted by earliest expected date.
- **`tags`** — Single `Delivery` tag covering all operations in this file.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Supplies shared parameters (`IdPathParam`, `PageParam`, `PageSizeParam`), shared response objects (`Unauthorized`, `Forbidden`, `NotFound`, `Conflict`), and the `Id` schema referenced throughout this file.
- **`src/modules/cart/openapi.yaml`** — The delivery shipping-methods endpoint explicitly defers to `PUT /cart/shipping-method` (defined in the cart module) as the authoritative server-side pricing and weight-fit check.
- **`src/modules/delivery/module.ts`** — The TypeScript module implementation that registers and serves the paths, schemas, and error-handling behaviour described in this spec.

## Notes

- Unpaged list endpoints (`/orders/{id}/fulfillment-orders`, `/orders/{id}/shipments`) return `items: []` for an empty set rather than a 404; absence is the answer.
- The `processOrder` endpoint is intentionally narrower than a generic order update: it exists so a warehouse caller with only `start:Shipment` can begin work without holding `update:Order`.
- `x-personal-data` schemas (`ExportShipment`, `ExportFulfillmentOrder`) are defined in this file's `components/schemas` but consumed by the account module's export endpoint via the bundler.
- The preorder board endpoint (`GET /delivery/fulfillment-orders`) is paged and has no `sort` parameter — the queue is always ordered by earliest expected date.
