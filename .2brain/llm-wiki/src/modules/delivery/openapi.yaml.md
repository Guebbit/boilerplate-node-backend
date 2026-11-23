---
source: src/modules/delivery/openapi.yaml
source_sha256: 70baa3c15e271fbaa33b569d0fcd22d7f97ce784d773b7e264b4b581efbfcd4b
context_sha256: 508d566fa49e375b1f4a1205904a1ac81bc14c9114dbb317bee86069027c353f
generated_at: 2026-11-22T04:51:06.001070+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/openapi.yaml

## Purpose
OpenAPI 3.1 contract for the `delivery` module (version `0.1.0`). It declares the module's tag, error codes, personal-data export sections and HTTP operations for fulfillment orders (the groups of order lines that ship together) and shipments (what actually leaves). It also covers shipping-method listing and the order `process` transition.

## Key elements
- **`tags`**: a single `Delivery` tag, in the `After the sale` family.
- **`x-error-codes`**: the module's named errors, each with an HTTP status.
  - `DELIVERY_LINES_INVALID` is a 422.
  - 409s: `DELIVERY_NOT_SHIPPABLE`, `DELIVERY_NOT_PHYSICAL`, `DELIVERY_NOT_DIGITAL`, `DELIVERY_NOT_HOLDABLE`, `DELIVERY_NOT_RELEASABLE`, `DELIVERY_NOT_DELIVERABLE`, `DELIVERY_NOT_LOSABLE`, `DELIVERY_NOT_REOPENABLE` and `DELIVERY_LOST_SUPERSEDED`.
  - `ORDER_NOT_PAID` and `ORDER_NOT_PROCESSING` are 409s on the order status.
- **`x-personal-data`**: adds `shipments` (array of `ExportShipment`) and `fulfillmentOrders` (array of `ExportFulfillmentOrder`) to `AccountExportResponse` for `POST /account/export`.
- **`GET /delivery/methods`** (`listShippingMethods`):
  - Public (`security: []`) and marked `x-cache: "max-age: 60"`.
  - It is a catalogue, not a quote. Authoritative pricing happens at `PUT /cart/shipping-method` and at checkout.
- **`GET /orders/{id}/fulfillment-orders`** (`listOrderFulfillmentOrders`):
  - Needs `read:Order`.
  - Returns `OrderFulfillmentOrdersResponse`, unpaged.
  - An unpaid order returns `items: []`, not a 404.
  - Hold details are role-dependent: `holdNotice` for the buyer, `holdMessage` for staff. `holdReason` and `holdNote` are staff-only.
- **`GET /orders/{id}/shipments`** (`listOrderShipments`):
  - Needs `read:Order`.
  - Returns `OrderShipmentsResponse`, oldest first and unpaged.
  - Staff with `display:Order` can read any order. Someone else's order is a 404.
- **`POST /orders/{id}/process`** (`processOrder`):
  - Needs `start:Shipment`.
  - Moves an order `paid → processing` and returns the `Order` schema from the orders module's `openapi.yaml`.
  - Refuses a non-`paid` order with `ORDER_NOT_PAID`.
  - Marked `x-versioned: [post]`.
- **`GET /delivery/fulfillment-orders`** (`listPreorderFulfillmentOrders`):
  - The admin preorder board. Needs `read:Order` and is paged.
  - Filters are `cause` (`preorder`, `backorder` or `any`), `state`, `productId`, `late` and `dueWithin`.
  - Staff with `display:Order` see all rows. Everyone else sees only their own orders' rows.
- The text mentions per-item reads at `GET /delivery/fulfillment-orders/{id}` and `GET /delivery/shipments/{id}`, and shipment creation at `POST /delivery/fulfillment-orders/{id}/shipments`.

## Relationships
- `src/modules/delivery/authorization.yaml` is the only graph neighbour. The operations here reference scopes such as `read:Order` and `start:Shipment` through `bearerAuth`, and `display:Order` in the descriptions. Presumably `authorization.yaml` defines them, but its content isn't visible here.
- The file also refers to a shared root contract (parameters `IdPathParam`, `PageParam`, `PageSizeParam`, the `Id` schema, and the `Unauthorized`, `Forbidden`, `NotFound` and `Conflict` responses) and to the orders module's `Order` schema. These are not graph neighbours.

## Notes
- Several `x-*` keys are bundler directives rather than standard OpenAPI:
  - `x-personal-data` is merged into `AccountExportResponse`.
  - `x-versioned` adds `ETag` and `Content-Location` headers to 2xx responses.
  - `x-error-codes` appears at module level and per operation, where it maps a status to the codes it can return. An example is `'409': [ORDER_NOT_PAID]`.
  - `x-cache` sets caching on the methods list.
- The `dueWithin` query parameter is declared with `type: int`, which is not a valid JSON Schema type (`integer` is).
- Local schemas such as `ShippingMethodsResponse`, `PreorderFulfillmentState`, `ExportShipment` and `ExportFulfillmentOrder` are referenced via `#/components/schemas/...`. Their definitions are not visible in the shown portion.
