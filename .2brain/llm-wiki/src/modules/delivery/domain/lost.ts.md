---
source: src/modules/delivery/domain/lost.ts
source_sha256: 285bbbd0154140c1b1a483c8a8d78f6a0f05b651b78bef0435f3c5b79c0b6e8d
context_sha256: 9ab4a91e855a3b4b5f4d38a993911f4870a81a42c2e7d6d9b56dbeafabd2ccaa
generated_at: 2026-11-22T04:48:22.189985+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/domain/lost.ts

## Purpose
Pure domain logic for a parcel that is lost in transit and later turns up. It computes how a fulfillment order's lines change on each event, and when the second (arrival) is allowed. Lost units reopen on the same fulfillment order and ship again normally; any part the shelf cannot cover moves to a new fulfillment order on hold. Being pure, every case is testable without a database.

## Key elements
- `LostShipmentFacts`: the lost shipment's id, origin `fulfillmentOrderId`, and lines (`productId`, `title`, `quantity`).
- `RestorableFulfillmentOrder`: a fulfillment order as the plan sees it: `id`, optional `sourceShipmentId` (the lost shipment whose owed units it waits for), and `lines`.
- `Restoration`: what turning up puts back. `shipped` is every unit the shipment carried, `owed` is the units that had moved to owed orders, and `owedFulfillmentOrderIds` lists the owed orders to close without a refund.
- `withLoss(lines, lost, owed)`: returns the origin's lines after a loss. Lost units come off `shippedQuantity` (floored at 0), owed units also come off `quantity`, and lines left with `quantity <= 0` are dropped.
- `planRestoration(shipment, orders)`: all-or-nothing check of whether a lost shipment may be recorded as arrived. Returns a `Restoration`, or `undefined` if the origin order is missing, any owed unit was shipped again or canceled, or the origin lacks enough open units for the shelf-covered part.
- `withRestoration(lines, shipment, restoration)`: returns the origin's lines after arrival. It adds shipped units back, adds owed units back to `quantity`, and re-creates lines the loss had dropped, titled from the shipment.
- `OwedDate`: `{ at, defaulted }`.
- `owedDateOf(restockDates, now, defaultDays)`: the promise date for owed units. It is the latest restock date if every product has one still in the future. Otherwise it is `now + defaultDays` with `defaulted: true`.

## Relationships
- Imports `DAY_MS` from `src/domain-primitives/time.ts` for the default-date arithmetic.
- Imports `plainLine`, `remainingOfLine` and the types `FulfillmentLine` and `ProductQuantity` from `src/modules/delivery/domain/fulfillment.ts`. It uses these to copy lines and to measure open units.
- Re-exported or aggregated through `src/modules/delivery/domain/index.ts` (listed as a neighbor).
- Used by the delivery services `src/modules/delivery/services/lost.ts`, `src/modules/delivery/services/found.ts`, `src/modules/delivery/services/owed.ts` and `src/modules/delivery/services/reship.ts`, which are neighbors in the graph and presumably call these planners.
- Exercised by the unit tests `src/modules/delivery/tests/unit/lost.test.ts`, `src/modules/delivery/tests/unit/fulfillment.test.ts` and `src/modules/delivery/tests/unit/reship.test.ts`.

## Notes
- `withLoss` also reduces `quantity` by the owed amount, so what a buyer can return or be refunded never exceeds what they bought.
- `planRestoration` returns `undefined` rather than throwing, so a caller must treat that as "cannot be restored".
- `owedDateOf` falls back to the default if any product lacks a future restock date, not just when none have one. This mirrors the rule an order's own backorder follows at checkout. `defaulted: true` means a later restock-date change should leave the date alone.
- The module doc comment points to a "lost-in-transit" section of the delivery module documentation for the broader design.
