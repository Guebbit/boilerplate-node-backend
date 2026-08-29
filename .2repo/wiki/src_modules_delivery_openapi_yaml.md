# src/modules/delivery/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the delivery module. It defines the three endpoints the module exposes (public shipping-method list, per-order shipment lookup, and an admin courier-advance action) plus the request/response schemas that back them. It exists so clients and other modules can discover the delivery API surface without reading implementation code.

## Key elements

- **GET /delivery/methods** (`listShippingMethods`) — Public endpoint returning the shop's shipping methods (flat rates and `freeAbove` thresholds). No auth required; pricing here is informational only.
- **GET /delivery/order/{orderId}** (`getShipmentByOrder`) — Authenticated endpoint returning the `Shipment` record (tracking code, `shipped`/`delivered` status) for one of the caller's orders. Returns 404 if the order hasn't reached `shipped` yet.
- **POST /delivery/advance** (`advanceCourier`) — Admin endpoint that transitions every `shipped` parcel to `delivered` in one tick. Returns the count of parcels advanced. Acts as the manual "cron" for the fake courier.
- **`ShippingMethod`** — Core schema: stable `id`, flat `price` (double ≥ 0), optional `freeAbove` threshold.
- **`Shipment`** — Core schema: `id`, `orderId`, `trackingCode`, `status` enum (`shipped` | `delivered`), optional `deliveredAt`, `createdAt`, `updatedAt`.
- **`CourierAdvanceResponse`** — Single field `advanced` (integer ≥ 0), the number of parcels that arrived on this tick.
- **`*Envelope`** wrappers — Uniform `{ success, status, message, data }` response shape wrapping each payload schema.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This file `$ref`s into the root contract for the shared `Id` schema, all four envelope primitives (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`), and every error response (`Unauthorized`, `NotFound`, `ValidationError`, `Forbidden`, `InternalError`). Changing those shared definitions ripples into every delivery response.
- **`src/modules/cart/openapi.yaml`** — The cart/checkout module is the consumer of `GET /delivery/methods`; the schema comment explicitly positions `ShippingMethod` as "the checkout's selector," meaning cart renders these methods to the buyer at purchase time.

## Notes

- **No cron, by design.** `POST /delivery/advance` is the only mechanism that moves parcels to `delivered`. The description explicitly notes this is an operator/demo button, not a scheduled job — similar to the expired-token purge.
- **Shipping prices are informational.** The methods endpoint is public and unauthenticated, but the description warns that authoritative pricing is computed at checkout against actual cart lines; the listed rates do not commit the shop.
- **`freeAbove` is optional.** When absent, the method never becomes free. It is not defaulting to zero — it is genuinely absent.
- **404 semantics for not-yet-shipped orders.** A 404 (not 409 or 202) is the explicit contract for "the order exists but hasn't shipped yet." Clients should treat 404 on this endpoint as a normal pre-shipment state, not a broken reference.
- **All schemas use `additionalProperties: false`.** Any field not listed is a contract violation; consumers can safely rely on the enumerated shape.
