---
source: src/modules/delivery/services/read.ts
sha256: 18d153108e10e0a7c1814f1d42059921c093a75b04aa4f9f28e0c4aeea3bd9c1
generated_at: 2026-10-29T03:42:47.409256+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/read.ts

## Purpose

All read operations for the delivery domain: listing and fetching fulfillment orders and shipments per order, the narrow reads the `returns` module makes (shipped quantities, remainder options), and the two bulk reads the account data export needs. Ownership is never on the delivery entity itself — every read resolves through the parent order's scope.

## Key elements

- **`listFulfillmentOrdersForOrder(orderId, authContext?)`** — Returns the caller's fulfillment orders for one order, each with computed `actions`. Calls `ensureFulfillmentOrders` first (safety net for paid orders missing them). A not-yet-paid order yields `[]`, not a 404.
- **`listShipmentsForOrder(orderId, authContext?)`** — Returns the caller's shipments for one order, each with `actions`. Also resolves `restorableIds` in one pass so a lost parcel's `deliver` flag can be stamped without an extra round-trip.
- **`getShipment(shipmentId, authContext?)`** — Single shipment by ID. Verifies the parent order exists *and* the caller can see it; both failures produce the same 404.
- **`getFulfillmentOrder(fulfillmentOrderId, authContext?)`** — Single fulfillment order by ID. Same scope-through-order pattern as `getShipment`.
- **`shippedQuantities(orderId)`** — Aggregates `shippedQuantity` across all of an order's fulfillment orders into per-product totals. Used by `returns` to gate what can come back.
- **`RemainderOption`** (interface) — Describes one fulfillment order's still-cancellable lines (product, frozen title, remaining quantity).
- **`remainderOptions(orderId, shipped)`** — Lists fulfillment orders with remaining units. Before anything has shipped, returns `[]` unless at least two groups are live (the last group is cancelled as the order, not as a remainder).
- **`findShipmentsForOrders(orderIds)`** / **`findFulfillmentOrdersForOrders(orderIds)`** — Bulk document reads for the account data export. Short-circuit to `[]` on empty input.

## Relationships

- **`../repository.ts`** — Primary data access: `fulfillmentOrderRepository` and `shipmentRepository` are the only paths to the database in this file.
- **`../domain/` (fulfillment.ts, index.ts)** — Provides `remainderLines`, `remainingOfLine`, and the `ProductQuantity` type used by `shippedQuantities` and `remainderOptions`.
- **`./actions.ts`** — Supplies `standingOn` (caller role), `fulfillmentOrderActions`, `presentShipmentFor`, and `viewFulfillmentOrder` for shaping the response records.
- **`./ensure.ts`** — `ensureFulfillmentOrders` is called inside `listFulfillmentOrdersForOrder` to auto-create missing fulfillment orders on a paid order.
- **`./found.ts`** — `restorableIds` (lost-parcel check) and `viewShipmentOf` (single-shipment projection) are consumed here.
- **`../presenter.ts`** — `presentFulfillmentOrder` shapes each list item in `listFulfillmentOrdersForOrder`.
- **`@modules/orders` (`orderService`)** — Every read resolves the parent order for scope and freshness; `callerScope(authContext)` is the shared authorization gate.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` wrap all return values.
- **`@infrastructure/i18n`** — `t` provides localized 404 messages.
- **`./index.ts`** — Re-exports these functions as part of the module's public service surface.
- **Tests (`fulfillment.test.ts`, `lost.test.ts`, `reship.test.ts`)** — Exercise the domain helpers (`remainderLines`, `remainingOfLine`) that this file's `remainderOptions` and `shippedQuantities` depend on.

## Notes

- **Two different 404 semantics.** The *list* functions return `[]` when the order isn't paid (absence is valid). The *single-item* functions return a 404 for both "not found" and "not yours" — callers cannot distinguish the two.
- **Fresh order read after `ensure`.** `listFulfillmentOrdersForOrder` re-fetches the order after `ensureFulfillmentOrders` because that call may have mutated the order's status. The original `order` reference is kept only as a fallback.
- **Export reads are deliberately outside `deliveryService`.** The two `find*ForOrders` helpers are exposed directly from this file so the account export module can call them without the broader admin subscription surface that `deliveryService` carries.
- **`remainderOptions` guard.** When `shipped` is false and fewer than two fulfillment orders are live, the function returns `[]` — the sole live group represents the whole order and must be cancelled via the order-cancel path, not the remainder path.
