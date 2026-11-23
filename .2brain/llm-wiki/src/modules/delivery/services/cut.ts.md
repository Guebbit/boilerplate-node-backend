---
source: src/modules/delivery/services/cut.ts
generated_at: 2026-11-22T04:53:42.312038+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/cut.ts

## Purpose
Writes one shipment out of a fulfillment order inside the calling act's transaction. It is the shared write step for every way of shipping: staff shipping, the digital fulfillment, and shipments created when an admin status override brings things in step. The fulfillment order is claimed by its revision (optimistic concurrency), so two acts racing on the same remainder cannot both succeed.

## Key elements
- `cutShipment(input, session)` — the only export with behavior. It does the following in order:
  1. Claims the fulfillment order by its revision, with the shipped lines added (`withShipped`), the status recomputed (`statusOfLines(…, false)`), and `holdReason`/`holdNote` unset.
  2. Allocates a new `Types.ObjectId` for the shipment.
  3. Builds the encrypted destination.
  4. Gets the next shipment number for the order.
  5. Writes the shipment.
  6. Optionally takes stock via the orders service's `shipStock`.
  It resolves to a `Cut`.
- `CutInput` — input interface:
  - `fulfillmentOrder`: the act's snapshot of the order.
  - `lines`: already validated against what remains.
  - `trackingCode?`
  - `forced`
  - `delivered`: the shipment is born `delivered` rather than `shipped`.
  - `at`: used for `shippedAt`, and for `deliveredAt` when delivered.
  - `takeStock`.
- `Cut` — result interface: `{ shipment, fulfillmentOrder }`, where `fulfillmentOrder` is the claimed (updated) document.
- `destinationFor` (private) — for `physical` fulfillment orders only, reads the order and encrypts its shipping address with `encryptDestination(address, shipmentId)`. It returns `undefined` for non-physical kinds or when the order has no address.
- `writeShipment` (private) — creates the shipment row. It includes the lines with titles copied from the fulfillment order (empty string if not found), `number`, `kind`, `status`, `forced`, and `shippedAt`. `destination`, `trackingCode` and `deliveredAt` are included only when present or applicable.

## Relationships
- `./act` — imports `refuse`. It is called with a 409 refusal (`delivery.not-shippable`) when the claim fails. The `@throws {ActRefusal}` doc refers to this.
- `../repository` — the fulfillment order repository provides the revision-guarded claim; the shipment repository provides numbering and insertion.
- `../domain` — `statusOfLines`, `withShipped` and `ProductQuantity` (fulfillment line logic).
- `../model` — `FulfillmentOrderDocument` and `ShipmentDocument` types.
- `../pii` — `encryptDestination`, which encrypts the address.
- `@modules/orders` — the order service reads the order, derives its shipping address, and takes stock (`shipStock`).
- `@types` — `FulfillmentOrderKind`.
- Per its module doc, the callers are the shipping acts (staff shipping, the digital fulfillment, and the override sync). Those imports are not visible in this file.

## Notes
- All calls take the act's `ClientSession` and are deliberately chained sequentially, because a transaction session does not support parallel operations.
- The shipment `_id` is allocated before the destination is encrypted because the ciphertext is bound to the shipment's id.
- A failed claim means the fulfillment order's revision moved since the act read it, and it surfaces as a 409 refusal.
- Shipping clears any hold on the fulfillment order, so an override can ship what staff had held back.
- With `takeStock: false`, stock is not touched. This is for the case where something else, such as an override, already took the units.
