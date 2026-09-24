---
source: src/modules/delivery/openapi.yaml
sha256: 8124d2de15a83555e69f955cb04e0f6e4e04dd6a093420f999ffa8720d436aef
generated_at: 2026-09-23T18:36:55.174293+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the delivery module. It defines the four HTTP endpoints that expose shipping-method selection and the shipment lifecycle (record handover, record arrival), plus the request/response schemas and the shared-envelope wrapper every response uses. It is the machine-readable source of truth for what the delivery module's `module.ts` must implement.

## Key elements

- **`GET /delivery/methods`** (`listShippingMethods`) — Public. Returns all shipping methods; optional `weight` query param filters by min/max weight. Prices shown are informational only; checkout re-validates.
- **`GET /delivery/order/{orderId}`** (`getShipmentByOrder`) — Authenticated. Returns the `Shipment` for an order. 404 if the order has not reached `shipped` (no parcel yet).
- **`POST /delivery/order/{orderId}/ship`** (`shipOrder`) — Authenticated. Creates the parcel record, sends the shipped email, and reports the transition to `orders` (`processing → shipped`). Requires `trackingCode` when the method's `tracked` flag is true (looked up live, not frozen). Supports a `forced` override (requires `orders.any.override` permission).
- **`POST /delivery/order/{orderId}/deliver`** (`deliverOrder`) — Authenticated. Stamps the shipment `delivered` and reports to `orders` (`shipped → delivered`).
- **`ShippingMethod`** — Schema for a single method: `id`, `price`, `freeAbove`, `tracked`, `maxInsuredValue`, `minWeight`, `maxWeight`.
- **`Shipment`** — Schema for a parcel record: `id`, `orderId`, `trackingCode`, `status` (`shipped` | `delivered`), timestamps.
- **`ShipOrderRequest`** / **`DeliverOrderRequest`** — Optional request bodies for the two POST endpoints.
- **Envelope schemas** (`ShippingMethodsResponseEnvelope`, `ShipmentEnvelope`) — Wrap payload data in the shared `{success, status, message, data}` structure.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every error response (`InternalError`, `Unauthorized`, `NotFound`, `ValidationError`, `Forbidden`, `Conflict`), the `Id` schema, and all envelope wrapper fields (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`) are `$ref`'d from the shared root contract. This file never redefines them.
- **`src/modules/cart/openapi.yaml`** — The cart/checkout module consumes `GET /delivery/methods` as its shipping-method selector and re-validates weight, price, and tracking requirements server-side at order time. The `tracked` flag and weight bounds defined here are the authoritative constraints checkout enforces.
- **`src/modules/delivery/module.ts`** — Implementation counterpart. The four `operationId`s map to handler functions in this module, which must satisfy the request/response contracts defined here.

## Notes

- **`tracked` is live, not frozen.** The `tracked` flag on a `ShippingMethod` is resolved against the order's `shippingMethod` id at ship time. Changing a method's tracking config after checkout changes whether `trackingCode` is required on the ship call.
- **`maxInsuredValue` is informational only.** Nothing in the application enforces it against an order total.
- **Weight filtering is advisory.** `GET /delivery/methods?weight=N` hides methods out of range for display, but checkout independently re-checks and can refuse a method regardless of what the list endpoint returned.
- **Ship/deliver are the exclusive state-transition path.** The descriptions explicitly state these endpoints (not `PUT /orders/{id}`) are how `processing → shipped` and `shipped → delivered` moves happen.
- **404 semantics on shipment read.** "No parcel yet" returns 404, not a null or empty body — absence of the resource is the answer.
