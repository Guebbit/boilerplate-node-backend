---
source: src/modules/delivery/service.ts
sha256: d69c6f05b08894154ca0370780eb37fe054bafcf99b25bc5c20f8e4248c84103
generated_at: 2026-09-27T14:51:17.598832+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/service.ts

## Purpose

Service layer for the delivery module. Orchestrates the three status doors — `startFulfilment` (paid → processing), `recordShipment`/`recordDelivery` (processing → shipped → delivered), and `fulfillOrder` (processing → delivered, digital-only) — by writing the parcel record first and then delegating every status change to the `orders` module. It also owns the shipping-method list endpoint and the shared "forced override" permission gate.

## Key elements

- **`listMethods`** (internal) – Returns the full `SHIPPING_METHODS` array annotated with the caller's live currency and `shipToCountries`. Always a success; no filtering (that belongs to the cart/checkout layer).
- **`toShipmentResponse`** (internal) – Maps a `ShipmentDocument` to the `openapi.yaml` `Shipment` shape, conditionally including optional fields.
- **`getForOrder`** (exported) – Fetches the shipment for an order, scoped through `orderService.callerScope` so non-admins only see their own. Returns 404 if the order or shipment is missing.
- **`startFulfilment`** (exported) – Moves a paid order to `processing`. No `forced` variant; admin override is handled by the orders module's own endpoint. Writes an audit entry on success.
- **`refuseUnearnedForce`** (internal) – Shared gate: if `forced` is true, the caller must hold `orders.any.override` **and** supply a `reason`; otherwise returns 403/422. Used by both `recordShipment` and `recordDelivery`.
- **`notifyShipped`** (internal) – Sends the carrier notification email (localised via `mailBuyer`) and writes an operator log line.
- **`auditOrderEvent`** (internal) – Writes a single `recordAudit` entry with the caller context, a `deliveryAuditActions` value, and the order as target.
- **`fulfillOrder`** (exported) – The digital-only path: `processing → delivered` with no parcel record. Refuses orders that still carry a physical line with the same 409 shape `recordShipment` uses for digital-only orders.
- **`afterShipmentRecorded`** (internal) – Post-parcel-write orchestration: moves the order to `shipped` (forced or normal), then notifies and audits. Order move is verified before side-effects fire.
- Rejection helpers – `notPaid`, `notProcessing`, `nothingToShip`, `notDigitalOnly`: shared 409 bodies so both doors produce symmetric "wrong door" errors.

## Relationships

- **`src/modules/orders`** (not listed as a graph neighbor but imported directly) – `orderService` performs all status writes (`markProcessing`, `markShipped`, `markFulfilled`, `forceMove`); `mailBuyer` localises and sends buyer-facing mail; `isDigitalOnlyOrder`, `shopCurrency`, `shipToCountries` supply domain predicates and live config.
- **`src/infrastructure/http/response.ts`** – `generateSuccess` / `generateReject` shape every return.
- **`src/infrastructure/i18n/index.ts`** – `t()` provides all user-facing message strings.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` delivers the carrier notification inside `notifyShipped`.
- **`src/infrastructure/adapters/logger.ts`** – `logger.info` logs the shipped event.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit` writes the admin-action audit trail.
- **`src/kernel/ability.ts`** – `holdsKey` checks `orders.any.override` in `refuseUnearnedForce`.
- **`src/modules/delivery/audit.ts`** – `deliveryAuditActions` enum values passed to `auditOrderEvent`.
- **`src/modules/delivery/domain/index.ts`** – `SHIPPING_METHODS` static array and `findShippingMethod` lookup used by `listMethods`.
- **`src/modules/delivery/controllers/*`** – The five controller files (`post-start-order`, `post-ship-order`, `post-deliver-order`, `post-fulfill-order`, `get-shipment-by-order`, `get-shipping-methods`) are the HTTP entry points that call the exports above.

## Notes

- **Orders is the sole status writer.** This module never mutates `Order.status` directly; it only calls `orderService` transition methods. If you're looking for the actual status write, it lives in the orders module.
- **Parcel write is idempotent; the order move is not.** The shipment upsert is unique on `orderId`, but the `markShipped`/`markFulfilled` move is at-most-once. `afterShipmentRecorded` checks the move result *before* notifying or auditing so a racing loser never fires side-effects for a shipment the order never reached.
- **`forced` is a two-key permission.** The route's own `delivery.any.update` gate is insufficient; `orders.any.override` is the second, stricter key, and a `reason` string is mandatory. Both `recordShipment` and `recordDelivery` share `refuseUnearnedForce` so the requirement cannot drift.
- **`listMethods` reads config per call.** `shopCurrency()` and `shipToCountries()` are live deployment values (`NODE_DEFAULT_CURRENCY`, `NODE_SHIP_TO_COUNTRIES`); caching them at import time would freeze the value.
- **Symmetric 409s for "wrong door."** A digital-only order hitting `recordShipment` and a physical order hitting `fulfillOrder` both get 409 with distinct codes (`ORDER_NOTHING_TO_SHIP` / `ORDER_NOT_DIGITAL_ONLY`) but the same HTTP status, so clients treat either as a routing error rather than a state error.
