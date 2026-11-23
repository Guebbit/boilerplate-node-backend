---
source: src/modules/delivery/services/found.ts
source_sha256: a8ff22aa828509a903f5eac936b0a0dd63a101998ab9711ef5a081d65fd9b195
context_sha256: 64bf3011a3c43de45c962f80cf15d5f3ddbe8cffec4cebc3b60db034b5a03041
generated_at: 2026-11-22T04:54:46.052217+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/found.ts

## Purpose
Handles a `lost` shipment turning up. It decides whether the shipment can still be recorded as arrived (every unit on it is still open, per `planRestoration`) and performs the all-or-nothing restore inside the arrival's transaction. The read-side flag and the act share the same rule, so a `ShipmentActions.deliver` flag cannot disagree with `deliver`.

## Key elements
- `planFor(shipment, orders)` (private): maps a shipment and its order's fulfillment orders into `LostShipmentFacts` and calls `planRestoration`. It returns `{ facts, restoration }`, where `restoration` is `undefined` if the shipment can't be restored.
- `restorableIds(shipments, orderId)`: returns the set of ids of `lost` shipments whose restoration plan exists. It skips the DB lookup if none are lost.
- `viewShipmentOf(shipment, order, authContext)`: builds the wire `Shipment` through `viewShipment`, passing whether the shipment is restorable.
- `refuseSuperseded()` (private): throws a 409 `DELIVERY_LOST_SUPERSEDED` refusal (`delivery.lost-superseded`).
- `closeOwed(ids, orders, session)` (private): for each owed fulfillment order, cancels the remaining lines (`withRemainderCanceled`), recomputes status, and claims it with cancel reason `found` and the hold fields unset. It then calls `announceCanceled`. If a claim fails it refuses as superseded.
- `restoreLostShipment(shipment, at, session)`: the main act. In order, it:
  1. Reads the order's fulfillment orders and plans the restoration.
  2. Marks the shipment found via `shipmentRepository.markFound`.
  3. Restores the origin fulfillment order's lines with `withRestoration` and claims it.
  4. Closes the owed fulfillment orders.
  5. Releases the stock-hold top-up through `orderService.releaseTopUp`. The shelf part goes back as stock, and the owed part goes as a `backorder` claim.

  It returns the now-delivered shipment.

## Relationships
- **`../domain`** (`fulfillment.ts`, `lost.ts`, `index.ts`): supplies the pure logic: `planRestoration`, `statusOfLines`, `withRemainderCanceled`, `withRestoration`, and the `LostShipmentFacts` and `Restoration` types.
- **`../repository`**: `fulfillmentOrderRepository` (`findByOrderId`, revision-checked `claim`) and `shipmentRepository`, used to mark the shipment found.
- **`../model`**: provides the `ShipmentDocument` and `FulfillmentOrderDocument` types.
- **`./act`**: provides `refuse`, used to raise the 409.
- **`./actions`**: provides `viewShipment`, which `viewShipmentOf` wraps.
- **`./announce`**: provides `announceCanceled`, called for each closed owed order.
- **`../../orders`** (`index.ts`, `model.ts`): the orders module's service is called to return the stock-hold top-up, and `OrderDocument` is used as a type.
- The `deliver` service (`./deliver`) is described in the module doc as the caller of the restore path, and `./read` and `./lost` are related graph neighbors. Their exact usage isn't visible in this file.

## Notes
- Every failure path (no plan, `markFound` miss, origin order missing, stale `claim` revision) raises the same `DELIVERY_LOST_SUPERSEDED` refusal. Because all writes share the act's `session`, a refusal rolls back the whole restore.
- `claim` uses the order's `revision`, so concurrent changes surface as a refusal rather than a silent overwrite.
- `restorableIds` reads without a session, so it is only a point-in-time check. `restoreLostShipment` re-plans inside the transaction.
- The module doc points to the "lost-in-transit" section of the delivery module documentation for the detailed rules.
