---
source: src/modules/delivery/services/progress.ts
source_sha256: 8ec5d810d2378f48f0325c745592c36580cab808f464d058342711edfead5ed6
context_sha256: 6aa23e3dba4ba0bdb08fdef201fced6b1303097dccbca29e9307e68c97cd44e2
generated_at: 2026-11-22T04:57:28.847900+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/progress.ts

## Purpose
Keeps the `orders` module in step with what delivery wrote, inside the act's transaction. The fulfillment summary is recomputed from the records themselves (never adjusted incrementally), and the order's status moves only when the summary says all goods have left or all have arrived. `orders` remains the only status writer; this file asks it to move, passing the act's session, and refuses the act when it cannot.

## Key elements
- `ProgressReport` — interface returned by `reportProgress`: the `order` as the summary write left it, the `summary` (`FulfillmentReport`), and the `fulfillmentOrders` and `shipments` that were read.
- `reportProgress(orderId, session)` — reads all fulfillment orders, then all shipments (sequentially, since a transaction session does not allow parallel operations). It computes `summarize({ fulfillmentOrders, shipments })` and passes the result to `orderService.recordFulfillmentProgress`. If that returns nothing, it refuses with 409 `DELIVERY_NOT_SHIPPABLE` (`delivery.not-shippable`), e.g. because the order was canceled in the meantime.
- `startFulfillment(order, session, actor)` — if `canProcessOrder(order.status)` is true, calls `orderService.markProcessing` to make the `paid → processing` move. Does nothing otherwise. Refuses with 409 `ORDER_NOT_PAID` (`delivery.not-paid`) if the order moved away from `paid` since the read.
- `settleOrder(orderId, at, session, actor?)` — calls `orderService.settleFulfillment`. Refuses with 409 `ORDER_NOT_PROCESSING` (`delivery.not-processing`) if a due move found the order elsewhere. Otherwise it returns `settled.reportCanceled`, a report-after-commit callback that is set only when the settlement canceled the order (lost parcel).

## Relationships
- `./act` — supplies `refuse`, used for all three 409 refusals.
- `../repository` — `fulfillmentOrderRepository` and `shipmentRepository` provide `findByOrderId(orderId, session)`.
- `../domain` — supplies `summarize` and the `FulfillmentReport` type.
- `../model` — supplies the `FulfillmentOrderDocument` and `ShipmentDocument` types.
- `@modules/orders` — `orderService` (`recordFulfillmentProgress`, `markProcessing`, `settleFulfillment`), `canProcessOrder` and the `OrderDocument` type.
- `@api/error-codes` — `ERROR_CODES` used in the refusals.
- The other delivery services in the neighbor list (such as `ship`, `deliver`, `fulfill` and `lost`) sit alongside this file in `services/`. This file does not import them. Based on its doc comments, shipping and fulfilling digital goods start the order themselves through `startFulfillment`.

## Notes
- Call order inside an act: `startFulfillment` runs before `reportProgress`, so the summary write and `settleOrder` see `processing`.
- `settleOrder` does not choose the status edge (ship, deliver, both, or the lost-parcel cancel); `orders` decides. This module only reports that goods moved.
- `settleOrder`'s `at` is the instant the clock starts for a completed order: the last arrival, or the cancel time.
- The caller owns the transaction. It must invoke the callback from `settleOrder` only after the transaction commits.
- The `reportProgress` refusal covers the delivery side of a ship racing a cancel: only one can win.
