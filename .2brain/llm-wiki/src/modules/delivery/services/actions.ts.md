---
source: src/modules/delivery/services/actions.ts
sha256: 37ae702098fdb719241724a36e7857ec99ef89af67417388f61d09223d7b4b17
generated_at: 2026-10-14T15:26:22.173384+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/actions.ts

## Purpose

Centralises the "what may this caller do to this order/shipment?" decision so that no client re-derives the rules. Combines caller standing (staff key, rank, ownership) with pure domain state predicates to produce per-action booleans, and exposes the final wire-ready view functions used by read paths.

## Key elements

- **`Standing`** (interface) — the three caller flags: `staff` (holds `delivery.any.update`), `reaches` (rank reaches the buyer), `owner` (is the buyer).
- **`standingOn(order, authContext)`** — resolves a `Standing` for a caller against an order; returns all-`false` when `authContext` is `undefined`.
- **`orderIn(status, allowed)`** (internal) — simple membership check of an `OrderStatus` against an allowed set.
- **`fulfillmentOrderActions(fulfillmentOrder, order, standing)`** — returns `{ ship, fulfill, hold, release, confirmWait }` booleans. All except `confirmWait` require `staff && reaches`; `confirmWait` requires `owner`. Each additionally gates on order status and the corresponding domain predicate.
- **`shipmentActions(shipment, order, standing)`** — returns `{ deliver, editTracking }`; both gated on `staff && reaches`, shipment status `'shipped'`, and order status in `processing | shipped`.
- **`viewFulfillmentOrder(fulfillmentOrder, order, authContext)`** — async; chains `standingOn` → `fulfillmentOrderActions` → `presentFulfillmentOrder` to produce the wire `FulfillmentOrder`.
- **`viewShipment(shipment, order, authContext)`** — async; chains `standingOn` → `shipmentActions` → `presentShipment` to produce the wire `Shipment`.

## Relationships

- **`@kernel/permissions`** (`callerForSubject`) — resolves the caller's permission subject for key lookups.
- **`@kernel/ability`** (`holdsKey`) — checks whether the caller holds `delivery.any.update`.
- **`../domain`** (re-exported from `domain/index.ts`, defined in `domain/fulfillment.ts`) — provides the pure state predicates `isShippable`, `isFulfillable`, `isHoldable`, `isReleasable`, `isAwaitingAnswer`.
- **`../model`** — supplies the document types `FulfillmentOrderDocument`, `ShipmentDocument`.
- **`../presenter`** — `presentFulfillmentOrder` and `presentShipment` convert document + actions into the wire shape.
- **`@modules/orders`** (`orderService.reachesBuyer`, `OrderDocument`) — resolves rank reachability and provides the order type.
- **`services/read.ts`**, **`services/ship.ts`**, **`services/fulfill.ts`**, **`services/holds.ts`**, **`services/confirm-wait.ts`**, **`services/tracking.ts`**, **`services/deliver.ts`** — downstream consumers that import the view and/or action helpers from this file.

## Notes

- `confirmWait` is the sole action gated on `standing.owner` rather than `staff && reaches` — only the buyer themselves can trigger it.
- `authContext` is intentionally optional (`AuthContext | undefined`); callers performing a read with no session context will receive all-`false` standing.
- The file is purely computational (no I/O beyond `orderService.reachesBuyer`); all state predicates are delegated to `../domain`.
- `shipmentActions` collapses `deliver` and `editTracking` into a single `open` guard — they are always enabled or disabled together.
