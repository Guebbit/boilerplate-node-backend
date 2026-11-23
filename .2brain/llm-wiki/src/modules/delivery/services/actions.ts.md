---
source: src/modules/delivery/services/actions.ts
source_sha256: 29a07e457364398848e1e758eef70167a6a808181c6ea55e9b462ce2152e3f66
context_sha256: 7b6f69a1e203ae80f139bc618739490f23d21451dcb994db1e203ed803611416
generated_at: 2026-11-22T04:52:37.181221+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/actions.ts

## Purpose
Decides what a caller may do to a fulfillment order or a shipment, so clients never re-derive the rules. Each action flag requires the permission key that names the act (e.g. `update:Shipment`); callers without it get all `false`. The state-only half of each rule is pure and lives in `../domain`; this file combines it with the caller's permissions and the parent order's status.

## Key elements
- `Standing` (interface): the caller's relationship to a fulfillment, with `staff` (holds `update:Shipment`) and `start` (holds `start:Shipment`, so shipping from `paid` makes the start move itself).
- `standingOn(authContext)`: computes a `Standing` using `callerForSubject` and `holds`. An undefined `authContext` (a read with no request) yields `{ staff: false, start: false }`.
- `fulfillmentOrderActions(fulfillmentOrder, order, standing)`: returns `FulfillmentOrderActions`:
  - `ship` and `fulfill` need staff, `isOpenForShipment(order.status, standing.start)`, and `isShippable` / `isFulfillable`.
  - `hold` and `release` need staff, `isAwaitingGoods(order.status)`, and `isHoldable` / `isReleasable`.
- `shipmentActions(...)` (module-private): returns `ShipmentActions`:
  - `deliver` needs staff and `canRecordArrival(order.status)`. The shipment lifecycle must allow `deliver`, or allow `find` with `restorable` true (a lost parcel whose units are all still open).
  - `update` needs staff and a physical shipment. It has no order-status condition.
  - `markLost` needs staff, `canRecordArrival`, lifecycle `lose`, and a physical shipment.
- `viewFulfillmentOrder(fulfillmentOrder, order, authContext)`: builds the wire `FulfillmentOrder` via `presentFulfillmentOrder`, passing the computed actions and `standing.staff`.
- `viewShipment(shipment, order, authContext, restorable?)`: computes `standingOn`, then delegates to `presentShipmentFor`.
- `presentShipmentFor(shipment, order, standing, restorable?)`: builds the wire `Shipment` for a caller whose standing is already known. It passes `presentShipment` the actions, `isAwaitingTracking(shipment, order.shippingMethod)` and `standing.staff`. The list read uses it so standing is computed once for all rows.

## Relationships
- `@kernel/permissions` (`callerForSubject`) and `@kernel/ability` (`holds`) supply the permission check in `standingOn`.
- `../domain` (fulfillment, lifecycle, tracking) supplies the pure state predicates (`isShippable`, `isFulfillable`, `isHoldable`, `isReleasable`, `isAwaitingTracking`) and `shipmentLifecycle`.
- `./ship-gate` supplies `isOpenForShipment`.
- `@modules/orders` (the orders lifecycle) supplies `canRecordArrival` and `isAwaitingGoods`, plus the `OrderDocument` type.
- `../model` supplies the `FulfillmentOrderDocument` and `ShipmentDocument` types.
- `../presenter` turns documents and computed actions into the wire shapes.
- `./found` is referenced in a comment: it is where `restorable` is worked out for `lost` shipments. The caller passes that value in.
- Sibling services (`read`, `ship`, `fulfill`, `holds`) are graph neighbors. This file does not import them.

## Notes
- Staff status alone does not grant `update` on a shipment: it is allowed at any time for physical shipments, including after arrival (tracking-code fixes).
- `hold` and `release` gate on `isAwaitingGoods`. `ship` and `fulfill` gate on `isOpenForShipment`, which also takes the `start` standing.
- `restorable` defaults to `false`, so a `lost` shipment is not offered `deliver` unless the caller says it can be restored.
