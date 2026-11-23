---
source: src/modules/orders/services/fulfillment.ts
source_sha256: 41ef7a06eaf957e4cdcf87a6e94b856a2e4727e78aac23ae58baedf0c719f9c8
context_sha256: 43ce7a5f303a7d8053ee2479555fd06eab4645902d123733ffe4b9ad54d5fdfa
generated_at: 2026-11-22T06:20:34.508794+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/fulfillment.ts

## Purpose
The set of "doors" the `delivery` module calls, inside its own transaction, when a fulfillment act changes where an order's goods stand. `orders` is the only writer of its own fields, so `delivery` reports (summary, forced-step history row, units leaving the shelf) and this file decides whether each still applies. Every transactional door takes the act's `ClientSession`, so the shipment, summary, status move and events commit or roll back together. The module doc points to the "the-fulfilment-summary" section of the orders module documentation.

## Key elements
- `recordFulfillmentProgress(orderId, summary, session)` — replaces the last fulfillment summary via `orderRepository.writeFulfillment`. The write is conditional on the order still being fulfillable (`paid`, `processing`, `shipped`, `delivered`), so a racing shipment and cancel resolve to one winner. Returns the updated order or `null`.
- `readOrder(orderId, session)` — reads the order within the act's transaction (`orderRepository.findInSession`), so refusals are decided from the same snapshot the writes land in. Returns `null` if missing.
- `shipStock(orderId, lines, session)` — takes a shipment's units off the shelf via `inventoryService.shipLinesForOrder`. Stock drops per shipment when goods leave, so later returns restock units that were really taken out.
- `topUpStock(orderId, lines, session)` — for a shipment reported lost: sets aside shelf units again, with the remainder as a claim on the restock (outside the backorder cap). Uses `inventoryService.reserveMoreForOrder` and returns `TopUp[]` per product.
- `releaseTopUp(orderId, lines, session)` — undoes `topUpStock` when the lost parcel turns up. The hold ends `shipped`, not `released`. Uses `releaseTopUpForOrder`; returns whether an open hold existed.
- `releaseStock(orderId, lines, session)` — gives held units back for a canceled, never-shipped remainder (`releaseLinesForOrder`). `returns` calls this rather than reaching into `inventory`. Returns whether an open hold existed.
- `extendHold(orderId, hours)` — extends a still-open hold by `hours` from now (for slow payments like bank debits) via `extendHoldForOrder`. No session; does nothing if the hold is claimed or missing.
- `isPayableNow(orderId)` — resolves to a positive answer only if the order exists, its status passes `isPayable`, and its hold has not been released. Asked before charging a card; not asked by doors that record money already taken.
- `refreshShelf(productIds)` — deletes availability entries via `inventoryService.forgetAvailability`, to be called after the transaction that moved the counters commits.

## Relationships
- **`inventory`** (`@modules/inventory`): all stock behavior is delegated to `inventoryService`; `StockLine` and `TopUp` types are imported from it. This file is `orders`' single gateway to inventory holds.
- **`../repository`**: `orderRepository` supplies `writeFulfillment`, `findInSession` and `findByIdScoped`.
- **`../model`**: `OrderDocument` is the return type for order reads and writes.
- **`../domain`**: provides `isPayable` and the `FulfillmentSummary` type.
- **`delivery`** (per the module doc): calls these doors within its transactions. **`returns`** calls `releaseStock`.
- **Tests**: `hold-doors.test.ts` and `ship-stock.test.ts` in `orders/tests/integration` exercise these doors.

## Notes
- A missing hold is not a closed hold: `isPayableNow` refuses only when the hold has been released.
- `refreshShelf` must run after commit, because the delete cannot roll back.
- `extendHold`, `isPayableNow` and `refreshShelf` take no session and run outside any act transaction.
