---
source: src/modules/delivery/services/found.ts
sha256: 8983b4b49bef6e852e0421d5563224cae75a3aa5980f3dd652b92a5650efc4ee
generated_at: 2026-10-29T03:39:51.023026+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/found.ts

## Purpose

Handles the "lost parcel turns up" scenario: a shipment previously marked `lost` is restored to `delivered`. Provides both the **act** (`restoreLostShipment`) and the **read-side** predicate (`restorableIds`) so that the `ShipmentActions.deliver` flag and the actual act always agree on whether restoration is still possible.

## Key elements

- **`restorableIds(shipments, orderId)`** — exported. Filters to `lost` shipments, checks each against `planRestoration`; returns a `Set<string>` of IDs whose units are all still open (i.e., restorable).
- **`viewShipmentOf(shipment, order, authContext)`** — exported. Wraps `viewShipment` from `./actions`, injecting the per-shipment restorable flag computed via `restorableIds`.
- **`restoreLostShipment(shipment, at, session)`** — exported. The act itself, executed inside the caller's Mongoose transaction:
  1. Plans the restoration via `planFor`.
  2. Marks the shipment `found` in the repository.
  3. Restores lines onto the origin fulfillment order.
  4. Closes every owed fulfillment order (cancelled, reason `found`, no refund).
  5. Releases the stock top-up via `orderService.releaseTopUp`, splitting shelf vs. backorder portions.
- **`planFor(shipment, orders)`** — internal. Maps a `ShipmentDocument` + fulfillment orders into `LostShipmentFacts` and calls `planRestoration` to produce a `Restoration` plan (or `undefined` if not restorable).
- **`refuseSuperseded()`** — internal. Shared 409 refusal (`DELIVERY_LOST_SUPERSEDED`) thrown whenever any precondition has changed.
- **`closeOwed(ids, orders, session)`** — internal. Cancels the owed fulfillment orders, unsets hold fields, and fires `announceCancelled`.

## Relationships

- **`../domain`** (index) — imports `planRestoration`, `statusOfLines`, `withRemainderCancelled`, `withRestoration` and the `LostShipmentFacts` / `Restoration` types. The all-or-nothing restoration logic lives in the domain layer.
- **`../repository`** — calls `fulfillmentOrderRepository.findByOrderId` / `.claim` and `shipmentRepository.markFound` to perform the read and the writes within the transaction.
- **`../model`** — consumes the `FulfillmentOrderDocument` and `ShipmentDocument` types that shape the repository results.
- **`./act`** — imports `refuse` to produce the standard `ActRefusal` error.
- **`./actions`** — imports `viewShipment` to delegate the read-side shaping of a single shipment.
- **`./announce`** — imports `announceCancelled` to emit an event for each closed owed order.
- **`@modules/orders`** — imports `orderService.releaseTopUp` (side-effect on the order) and the `OrderDocument` type.

## Notes

- The restore is **all-or-nothing**: if `planRestoration` returns `undefined`, or if any `claim` / `markFound` call detects a concurrent revision change, the function throws `refuseSuperseded` (409). The caller is expected to roll back the transaction.
- `restorableIds` is intentionally the **single source of truth** for the read flag. Any code that sets `ShipmentActions.deliver` for a lost shipment should derive it from this function so the flag can never contradict the act.
- The top-up release in `restoreLostShipment` splits each product's quantity into a shelf portion (`quantity − owed`) and a backorder portion (`owed`), tagged `kind: 'backorder'`, before handing the array to `orderService.releaseTopUp`.
- `closeOwed` does **not** issue a refund; the cancel reason is `FulfillmentCancelReason.found`, signalling the parcel arrived rather than being written off.
