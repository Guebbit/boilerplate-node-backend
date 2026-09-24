---
source: src/modules/delivery/service.ts
sha256: d3eff12013686bde3afde3abdc47472a3d75e776e3a579b7ee8938fd457e69c8
generated_at: 2026-09-23T18:37:34.806873+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/service.ts

## Purpose

Service layer for the delivery lifecycle: records a parcel's handover to a carrier (`recordShipment`) and its arrival (`recordDelivery`). It owns all shipment/parcel writes and delegates every order-status mutation to the `orders` module — delivery never writes order status directly.

## Key elements

- **`listMethods(weight?)`** — Returns the shipping-method selector payload. Filters by basket weight (advisory only); always a success response.
- **`getForOrder(orderId, authContext?)`** — Reads the shipment for an order, scoped to the caller's ownership via `orderService.callerScope`. 404 if the order or shipment is missing.
- **`recordShipment(orderId, trackingCode?, context, forced?, reason?)`** — The "shipped" door. Validates eligibility (normal or override), writes the shipment record (idempotent upsert), then asks `orders` to move to `shipped`. On success, fires the carrier email and audit entry.
- **`recordDelivery(orderId, context, forced?, reason?)`** — The "delivered" door (truncated). Confirms a `shipped` parcel exists _first_ (read-only), then moves the order, then stamps the shipment `delivered`.
- **`refuseUnearnedForce(context, forced, reason)`** — Shared gate: a `forced: true` call must hold the `orders.any.override` ability key _and_ supply a reason string. Returns a 403/422 reject or `undefined`.
- **`notifyShipped(orderId, order, shipment)`** — Resolves the buyer's locale/username, enqueues the shipment email, and logs.
- **`moveAndStampDelivered(orderId, context, forced?, reason?)`** — Order-first delivery write: moves the order to `delivered`, then conditionally updates the shipment (`updateStatusIfIn`).
- **`toShipmentResponse(shipment)`** — Maps a `ShipmentDocument` to the OpenAPI `Shipment` shape (optional fields spread conditionally).

## Relationships

- **`./domain` (rates.ts, index.ts)** — Provides `findShippingMethod` and `methodsForWeight` for tracking-code validation and the methods list.
- **`./audit.ts`** — Supplies the `deliveryAuditActions` enum values used in audit entries.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` for structured audit logging.
- **`@infrastructure/adapters/mailer.ts`** — `enqueueEmail` for the shipped-parcel notification.
- **`@infrastructure/adapters/logger.ts`** — Operator-facing log line on shipment.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` response constructors.
- **`@infrastructure/i18n` (catalog, context, index)** — `t()` for user-facing error strings; `getDefaultLocale` for email fallback.
- **`@kernel/ability.ts`** — `holdsKey` to check the `orders.any.override` permission for forced operations.
- **`@modules/orders`** — `orderService.getById`, `callerScope`, `markShipped`, `markDelivered`, `forceMove`; `canTransition`, `canOverrideTo` for lifecycle eligibility.
- **`@modules/users`** — `userService.getById` to resolve buyer locale/username for the notification email.
- **`./repository`** — `shipmentRepository.upsertForOrder`, `findByOrderId`, `updateStatusIfIn`.
- **`./emails`** — `shipmentShippedEmail` template builder.
- **Controllers** (`post-ship-order`, `post-deliver-order`, `get-shipment-by-order`, `get-shipping-methods`) — Invoke the exported functions; this file is their sole service dependency.

## Notes

- **Write order is deliberate and asymmetric.** Shipment: parcel written _before_ order move (parcel is the primary record). Delivery: order moved _before_ parcel stamped (parcel is evidence of the order's state). This prevents an orphaned `delivered` parcel paired with a `shipped` order on a refused move.
- **Order moves are at-most-once, not transactional.** A racing loser in `recordShipment` still gets a 409 after the idempotent upsert has already written — the parcel exists but the order did not move.
- **`forced` is a second, stricter permission** on top of the route-level `delivery.any.update` gate. Requiring both the `orders.any.override` key _and_ a reason string is the contract; the reason is recorded on the order's override history.
- **`listMethods` weight filter is advisory.** `cart`'s checkout re-validates the chosen method against the real basket server-side; a stale or omitted weight here cannot unlock a hidden method.
- **`order.userId` may be absent** after account detach; `notifyShipped` falls back to `order.email` and the default locale.
