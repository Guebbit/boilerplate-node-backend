---
source: src/modules/delivery/services/found.ts
sha256: 95426ef8c1afb4ff86d6971c8f8916b0629d112d46072b39f0f315bf33c0863a
generated_at: 2026-11-08T05:35:34.387826+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/found.ts

## Purpose

Handles the "found" lifecycle of a lost shipment: the moment a parcel that was marked `lost` physically arrives. It restores the shipment's units onto the origin fulfillment order, closes any owed (backorder) fulfillment orders with no refund, and releases the stock top-up — all inside a single transaction, all-or-nothing. It also exposes the read-side predicate (is this lost shipment still restorable?) so the `ShipmentActions.deliver` flag can never disagree with the act.

## Key elements

- **`restorableIds`** *(exported)* — Given all shipments of an order, returns a `Set<string>` of lost-shipment IDs whose units are all still open. Filters to `ShipmentStatus.lost`, then checks each via `planFor`.
- **`viewShipmentOf`** *(exported)* — Wraps `viewShipment` (from `./actions`), injecting the restorable boolean so the wire `Shipment` carries a correct `deliver` flag.
- **`restoreLostShipment`** *(exported)* — The act. Marks the shipment found, applies `withRestoration` to the origin fulfillment order, calls `closeOwed`, and releases the stock top-up via `orderService.releaseTopUp`. Throws 409 `DELIVERY_LOST_SUPERSEDED` on any concurrency or planning failure.
- **`planFor`** *(internal)* — Builds `LostShipmentFacts` from a shipment document and calls `planRestoration` against the order's fulfillment orders to produce a `Restoration` (or `undefined` if impossible).
- **`closeOwed`** *(internal)* — Iterates the owed fulfillment orders, cancels each with `FulfillmentCancelReason.found`, clears hold fields, and fires `announceCanceled`.
- **`refuseSuperseded`** *(internal)* — Shared 409 refusal helper (`DELIVERY_LOST_SUPERSEDED`).

## Relationships

- **`../domain`** (`fulfillment.ts`, `lost.ts`) — Imports the pure planning functions `planRestoration`, `withRestoration`, `withRemainderCanceled`, `statusOfLines` and the types `LostShipmentFacts`, `Restoration`.
- **`../repository`** — Uses `fulfillmentOrderRepository` (find-by-order, `claim`) and `shipmentRepository` (`markFound`).
- **`./act`** — Reuses the generic `refuse` helper for structured error throws.
- **`./actions`** — Delegates to `viewShipment` for building the wire representation.
- **`./announce`** — Calls `announceCanceled` after each owed order is closed.
- **`@modules/orders`** — Calls `orderService.releaseTopUp` to return the stock hold; consumes `OrderDocument` for the view path.
- **`src/modules/delivery/services/deliver.ts`** — Expected caller of `restoreLostShipment` as the `lost`-branch of the deliver act.

## Notes

- **All-or-nothing.** If *any* unit on the shipment was already re-shipped or canceled (i.e. `planRestoration` returns `undefined`), the entire restore is refused. There is no partial path.
- **Read/act consistency.** Both `restorableIds` (read flag) and `restoreLostShipment` (act) funnel through the same `planFor` → `planRestoration` logic, guaranteeing the flag and the outcome can't diverge.
- **Optimistic concurrency.** Every mutation (`markFound`, `claim`) is a compare-and-swap on a revision. A failed `claim` inside `closeOwed` aborts the loop and the surrounding transaction via `refuseSuperseded`.
- **Top-up split.** `releaseTopUp` receives two buckets per product: the shelf portion (released as stock) and the owed portion (released as a backorder claim). The split is derived from `restoration.owed`.
