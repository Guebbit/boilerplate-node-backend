---
source: src/modules/delivery/services/actions.ts
sha256: 25b7530a386d3bbe04512795eae905dff80bb1bdb8a4cff50f71b95e7d89ec07
generated_at: 2026-10-29T03:37:37.145890+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/actions.ts

## Purpose

Centralises the "what can this caller do?" decision for fulfillment orders and shipments. It combines the caller's permission keys with the entity's state (the pure state predicates live in `../domain`) to produce a set of boolean action flags, and provides the wire-format "view" functions that hand those flags to the client so no consumer re-derives the rules.

## Key elements

- **`Standing`** (interface) — two booleans: `staff` (holds `update:Shipment`) and `start` (holds `start:Shipment`).
- **`standingOn(authContext)`** — resolves a caller's `Standing` from their permission subject; returns all-`false` when `authContext` is undefined.
- **`fulfillmentOrderActions(fo, order, standing)`** — returns `{ ship, fulfill, hold, release }` for one fulfillment order. `ship`/`fulfill` additionally require `isOpenForShipment`; `hold`/`release` additionally require the order to be in `awaitingGoods`.
- **`shipmentActions(shipment, order, standing, restorable?)`** — returns `{ deliver, update, markLost }` for one shipment. `deliver` requires `canRecordArrival` on the order and the shipment to be `shipped` (or `lost` + `restorable`). `update` is gated only on `staff` + `physical` kind. `markLost` requires `shipped` + `physical`.
- **`viewFulfillmentOrder(fo, order, authContext)`** — resolves standing, computes actions, delegates to `presentFulfillmentOrder`; returns the wire `FulfillmentOrder`.
- **`viewShipment(shipment, order, authContext, restorable?)`** — convenience wrapper that resolves standing then calls `presentShipmentFor`.
- **`presentShipmentFor(shipment, order, standing, restorable?)`** — same as `viewShipment` but takes a pre-resolved `Standing`, so list reads compute standing once for every row.

## Relationships

- **`src/kernel/permissions.ts`** — imports `callerForSubject` to resolve the caller's subject for permission lookups.
- **`src/kernel/ability.ts`** — imports `holds` to check whether the caller holds a specific action/resource key.
- **`src/modules/orders/index.ts`** (→ `domain/lifecycle.ts`) — imports `canRecordArrival`, `isAwaitingGoods`, and the `OrderDocument` type.
- **`src/modules/delivery/domain/index.ts`** (→ `fulfillment.ts`, `tracking.ts`) — imports the pure state predicates `isShippable`, `isFulfillable`, `isHoldable`, `isReleasable`, `isAwaitingTracking`.
- **`src/modules/delivery/services/ship-gate.ts`** — imports `isOpenForShipment` to gate the `ship`/`fulfill` actions on order lifecycle.
- **`src/modules/delivery/model.ts`** — imports `FulfillmentOrderDocument` / `ShipmentDocument` as the input shapes.
- **`src/modules/delivery/presenter.ts`** — imports `presentFulfillmentOrder` / `presentShipment` to build the wire objects.
- **`src/modules/delivery/services/found.ts`** — referenced in the `restorable` parameter contract; the caller of `shipmentActions` / `viewShipment` is expected to compute that flag there.

## Notes

- **`restorable` is an external input.** This file never computes it; the caller (typically `./found`) determines whether every unit on a `lost` shipment is still open and passes the boolean in.
- **`update` on a shipment has no state gate.** Any staff member can set/fix the tracking code on a physical shipment regardless of its status — the doc comment clarifies this is intentional ("once and after arrival").
- **`hold` / `release` gate on order status, not fulfillment-order status.** Both require `isAwaitingGoods(order.status)` *and* a fulfillment-order predicate.
- **`presentShipmentFor` exists for list performance.** It skips the `standingOn` resolution so a list read computes permissions once instead of per-row.
- The state predicates are deliberately kept in `../domain` (pure, no caller context); this file's only added axis is *who* is asking.
