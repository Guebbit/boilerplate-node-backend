---
source: src/modules/delivery/services/actions.ts
sha256: e83b3097a5308f80199cdccf4143f240128b3623bd404dc80438a3f5aa94b0ed
generated_at: 2026-11-14T19:43:32.784309+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/actions.ts

## Purpose

Centralises the decision of *what a caller is allowed to do* with a fulfillment order or a shipment. It combines the caller's permission standing (kernel) with pure domain state predicates (lifecycle, fulfillability, etc.) to produce an action-availability map, then hands that map to the presenters so the wire response always reflects the requesting user's rights. No client re-derives these rules.

## Key elements

- **`Standing` (interface)** — Two booleans: `staff` (holds `update:Shipment`) and `start` (holds `start:Shipment`). All other action logic derives from these.
- **`standingOn(authContext)`** — Resolves a `Standing` from an `AuthContext` via `callerForSubject` + `holds`. Returns all-`false` when `authContext` is `undefined`.
- **`fulfillmentOrderActions(fulfillmentOrder, order, standing)`** — Returns a `FulfillmentOrderActions` map (`ship`, `fulfill`, `hold`, `release`). `ship`/`fulfill` are additionally gated by `isOpenForShipment`; `hold`/`release` require `isAwaitingGoods(order.status)` to be true.
- **`shipmentActions` (private)** — Returns a `ShipmentActions` map (`deliver`, `update`, `markLost`). `deliver` is gated by the shipment lifecycle and, for a `lost` parcel, by the `restorable` flag. `update` (tracking-code edit) is always available to staff on physical parcels regardless of lifecycle state. `markLost` requires the lifecycle to allow the transition and the parcel to be physical.
- **`viewFulfillmentOrder(fulfillmentOrder, order, authContext)`** — Public single-entity view: derives standing, computes actions, delegates to `presentFulfillmentOrder`.
- **`viewShipment(shipment, order, authContext, restorable?)`** — Public single-entity view for shipments; delegates to `presentShipmentFor`.
- **`presentShipmentFor(shipment, order, standing, restorable?)`** — Same as `viewShipment` but accepts a pre-computed `Standing` so list reads (e.g. `services/read.ts`) resolve permissions once per request instead of per row.

## Relationships

- **`src/kernel/ability.ts`** — Calls `holds` to test whether the caller's subject carries a given action/resource pair.
- **`src/kernel/permissions.ts`** — Calls `callerForSubject` to resolve the effective permission subject from the `AuthContext`.
- **`src/modules/delivery/domain/index.ts`** — Imports the pure state predicates (`isShippable`, `isFulfillable`, `isHoldable`, `isReleasable`, `isAwaitingTracking`) and `shipmentLifecycle` (a transition table) that form the "state half" of every rule.
- **`src/modules/delivery/services/ship-gate.ts`** — Imports `isOpenForShipment`, which takes both the order status *and* the `start` standing, making the gate permission-aware.
- **`src/modules/delivery/presenter.ts`** — Consumes the action maps via `presentFulfillmentOrder` and `presentShipment` to shape the wire payload.
- **`src/modules/delivery/model.ts`** — Source of the `FulfillmentOrderDocument` and `ShipmentDocument` document types used throughout.
- **`src/modules/orders/domain/lifecycle.ts`** (via `@modules/orders`) — Provides `canRecordArrival` and `isAwaitingGoods`, the order-side state checks for shipment actions.
- **`src/modules/delivery/services/found.ts`** — Upstream of the `restorable` parameter: that service determines whether a `lost` shipment's units are still open, then passes the result into `viewShipment` / `presentShipmentFor`.
- **`src/modules/delivery/services/read.ts`** — List-level consumer that calls `presentShipmentFor` with a single shared `Standing` to avoid per-row permission lookups.
- **`src/modules/delivery/services/ship.ts`, `fulfill.ts`, `holds.ts`** — Action-execution services that rely on the same predicates; `actions.ts` is the read-side mirror that tells the client which of those actions are currently available.

## Notes

- The `restorable` flag is an explicit injection point: `actions.ts` does not import `found.ts`. Callers compute restorability and pass it in, keeping the dependency direction one-way.
- `update` (tracking-code correction) is deliberately *not* gated by lifecycle state — it is available to staff on any physical shipment at any point. This is a product decision encoded in the one-line condition.
- `isOpenForShipment` accepts the `start` standing, so the "order is open for shipment" check itself depends on permissions. A caller with `start:Shipment` sees `paid` as open; without it, the same order is not open.
- `presentShipmentFor` is exported (not just a helper) specifically so list reads can hoist the standing computation outside the row loop.
