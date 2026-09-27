---
source: src/modules/delivery/openapi.yaml
sha256: 98f51d09835e533da40091485577ae04c188624b43df06b241d970346067bc3f
generated_at: 2026-09-27T14:50:22.871786+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the delivery module. It defines the six HTTP endpoints that expose shipping-method catalogue, per-order shipment tracking, and the order-lifecycle transitions the warehouse performs (`paid → processing → shipped → delivered`, plus a digital-only shortcut). It exists so that API consumers, the UI, and the module's implementation agree on shapes, auth, and error semantics without reading the code.

## Key elements

- **`GET /delivery/methods`** — Public (no auth) catalogue of all shipping methods (`ShippingMethodsResponseEnvelope`). Described explicitly as a catalogue, not a quote; real pricing is enforced at `PUT /cart/shipping-method` and checkout.
- **`GET /delivery/order/{orderId}`** — Returns the shipment (tracking code, delivered flag) for one order. 404 if the order has not reached `shipped`.
- **`POST /delivery/order/{orderId}/ship`** — Creates the parcel record, sends the shipped email, and advances the order `processing → shipped`. `trackingCode` is conditionally required when the method is `tracked`. Rejects non-`processing` orders (409) and digital-only orders (409 `ORDER_NOTHING_TO_SHIP`).
- **`POST /delivery/order/{orderId}/start`** — Moves an order `paid → processing`. Intentionally narrower than `orders.any.update` so the warehouse can begin work without full order-mutation rights.
- **`POST /delivery/order/{orderId}/deliver`** — Stamps the shipment delivered; order moves `shipped → delivered`.
- **`POST /delivery/order/{orderId}/fulfill`** — Digital-only path: moves a `processing` order straight to `delivered` with no parcel. Rejects orders that still have shippable lines (409 `ORDER_NOT_DIGITAL_ONLY`).
- **Schemas** — `ShippingMethod` (id, price, currency, tracked, requiresAddress, optional freeAbove), `ShippingMethodsResponseEnvelope`, `ShipmentEnvelope`, `ShipOrderRequest`, `DeliverOrderRequest`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every error response (401, 403, 404, 409, 422, 500) and the `Id` path-parameter schema are `$ref`-imported from the shared root contract. This file never redefines them.
- **`src/modules/cart/openapi.yaml`** — The shipping-method list here feeds the cart/checkout selector. The file's descriptions point to `PUT /cart/shipping-method` as the authoritative pricing/weight-fit gate; this endpoint is read-only reference data.
- **`src/modules/delivery/module.ts`** — The runtime implementation that satisfies these paths. The schemas and response envelopes defined here are the shapes that module must return.

## Notes

- `GET /delivery/methods` is the only endpoint with `security: []`; every other path requires `bearerAuth`.
- The `start` and `fulfill` endpoints return an `OrderEnvelope` (imported from `../orders/openapi.yaml`), while `ship` and `deliver` return the local `ShipmentEnvelope`. Don't assume a uniform response type across the lifecycle.
- The `shippingMethodId` on a `ShippingMethod` is described as "frozen onto orders at checkout" — the method object in the catalogue and the one stamped on an order are snapshots, not live references.
- Digital-only vs. physical orders take different doors (`fulfill` vs. `ship`/`deliver`); the 409 error codes (`ORDER_NOTHING_TO_SHIP`, `ORDER_NOT_DIGITAL_ONLY`) are the only way to tell which path applies.
