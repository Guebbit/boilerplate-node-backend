---
source: src/modules/delivery/services/actions.ts
sha256: 07eae5d1bf0e36f3ba365b1eb62387ce6ce75b6a084d8cb8c146a8aac8831d21
generated_at: 2026-11-08T05:33:29.313233+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/actions.ts

## Purpose

Centralizes the decision of *what a caller is allowed to do* to a fulfillment order or shipment. It combines the caller's permission standing (kernel) with the entity's current state (domain) to produce a flat set of boolean action flags, so that no client, presenter, or downstream service re-derives those rules independently.

## Key elements

- **`Standing`** (interface) — Two booleans: `staff` (`update:Shipment` key held) and `start` (`start:Shipment` key held).
- **`standingOn(authContext)`** — Resolves the caller's `Standing`. Returns `{staff: false, start: false}` when `authContext` is `undefined` (unauthenticated read).
- **`fulfillmentOrderActions(fulfillmentOrder, order, standing)`** — Returns `FulfillmentOrderActions` flags (`ship`, `fulfill`, `hold`, `release`). Each flag requires the `staff` standing plus a domain state predicate and, for ship/fulfill, the `isOpenForShipment` gate.
- **`shipmentActions(shipment, order, standing, restorable?)`** — Returns `ShipmentActions` flags (`deliver`, `update`, `markLost`). `deliver` allows a `lost` shipment when `restorable` is true. `update` is available on any physical parcel regardless of status. `markLost` requires `shipped` status and physical kind.
- **`viewFulfillmentOrder(fulfillmentOrder, order, authContext)`** — One-shot helper that computes standing, derives actions, and delegates to `presentFulfillmentOrder`.
- **`viewShipment(shipment, order, authContext, restorable?)`** — One-shot helper that computes standing and delegates to `presentShipmentFor`.
- **`presentShipmentFor(shipment, order, standing, restorable?)`** — Same as `viewShipment` but accepts a pre-computed `Standing`, intended for list reads that resolve standing once for every row.

## Relationships

- **`@kernel/permissions`** (`callerForSubject`) and **`@kernel/ability`** (`holds`): Used inside `standingOn` to resolve the caller's permission keys.
- **`@modules/orders`** (`canRecordArrival`, `isAwaitingGoods`, `OrderDocument` type): Order-level state predicates consumed by `shipmentActions` and `fulfillmentOrderActions`. (Re-exported via `src/modules/orders/index.ts` from `src/modules/orders/domain/lifecycle.ts`.)
- **`../domain`** (`isAwaitingTracking`, `isFulfillable`, `isHoldable`, `isReleasable`, `isShippable`): Pure state predicates defined in `fulfillment.ts` / `tracking.ts` and re-exported through `domain/index.ts`.
- **`./ship-gate`** (`isOpenForShipment`): Gates `ship` and `fulfill` actions on the order's status and the caller's `start` standing.
- **`../model`** (`FulfillmentOrderDocument`, `ShipmentDocument`): Input document types accepted by every function here.
- **`../presenter`** (`presentFulfillmentOrder`, `presentShipment`): Called by the `view*` / `presentShipmentFor` helpers to build the wire-ready objects.
- **`./found`** (referenced in the `restorable` doc-comment): The caller of `shipmentActions`/`presentShipmentFor` is expected to supply `restorable` based on the logic in `found.ts`.
- **`./fulfill`, `./holds`, `./read`, `./ship`**: Downstream services that consume the action flags produced here (reverse dependency).

## Notes

- `presentShipmentFor` exists specifically to avoid re-resolving standing per row in list reads; prefer it over `viewShipment` when looping.
- The `restorable` flag is a *caller-supplied* signal, not derived here. `./found` owns the logic that determines whether every unit on a `lost` shipment is still open.
- `update` on a shipment (tracking-code fix) is the only action that does **not** require the order to be in a "recordable" status — it is available on any physical parcel once the shipment exists.
- All action flags are `false` when `authContext` is `undefined`; there is no fallback or guest permission path.
