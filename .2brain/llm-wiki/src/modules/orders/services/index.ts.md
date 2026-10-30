---
source: src/modules/orders/services/index.ts
sha256: 0aa31652be352ba2ace5846ef981ad13ecd93948b063f0d08bf82c0fc89c3640
generated_at: 2026-10-29T04:47:29.857939+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/index.ts

## Purpose

Barrel (public facade) for the Order entity's service layer. It aggregates every business-logic function from the module's sub-files and re-exports them as a single `orderService` object, enforcing a single call-in point for controllers and cross-module callers. It also re-exports the public type surface and two config getters that the barrel-allowed-sources rule prevents from being published directly via `../index.ts`.

## Key elements

- **`orderService`** — the sole exported runtime object. Groups ~70 functions by concern:
  - *Write door:* `placeOrder` (from `./place`), `create` (from `./crud`).
  - *Reads / scope:* `search`, `getById`, `getForCaller`, `callerScope`, `ownerScope`, `ownLiveScope`, `findManyByIds`, `findOwnOrders`, `orderBriefsByIds`.
  - *Status transitions:* `markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfilmentComplete`, `markUndeliverable`, etc. (from `./status`).
  - *Fulfilment / stock:* `readOrder`, `shipStock`, `topUpStock`, `releaseStock`, `releaseTopUp`, `extendHold`, `refreshShelf` (from `./fulfillment`).
  - *Cancellation / withdrawal:* `cancelOnRequestById`, `withdrawById`, `withdrawOnBuyersBehalfById`, `expireReservationById`, `cancelForPaymentMismatchById` (from `./cancel`).
  - *PII / retention:* `detachUserId`, `eraseUserOrders`, `startOrderPiiClock`, `anonymizeDueOrders` (from `./retention`).
  - *Timeline:* `appendTimeline`, `readTimeline`, `collectTimelineOf`, `clearTimelineActor`, `scrubTimelineText` (from `./timeline`).
  - *Stats / analytics:* `paidBuckets`, `productTotals`, `categoryTotals`, `productSeries`, `customerCounts`, `cancellationCohort`, `pipeline` (from `./stats`).
  - *Mail / notify:* `mailOrderPlaced`, `mailBuyer`, `mailBuyerOfOrder`, `mailOrderCancelled`.
  - *Actions / UI:* `withActions`, `withListActions` (from `./actions`).
- **Re-exported types:** `OrderBrief`, `PlaceOrderInput`, `PlaceOrderLine`, `PlaceOrderOutcome`, `CancelCause`, `OrderExport`, `PaidBucket`, `ProductTotal`, `CategoryTotal`, `ProductSeriesRead`, `AwaitingTransfers`, `PipelineRead`.
- **Re-exported config getters:** `orderFrontendLink`, `withdrawalPeriodDays` (from `../config`).

## Relationships

- **`src/modules/cart/services/checkout.ts`** and **`src/modules/cart/services/reorder.ts`** — call `orderService.placeOrder` (the single write door) and read helpers to compose a new order from cart state.
- **`src/modules/cart/controllers/post-checkout.ts`** — invokes `orderService` methods (e.g. `markPaid`, `openOrderExport`) in the post-checkout controller flow.
- **`src/modules/delivery/services/`** (`deliver.ts`, `act.ts`, `announce.ts`, `board.ts`, `cut.ts`, `digest.ts`, `ensure.ts`, `cancel-remainder.ts`) — drive status transitions (`markShipped`, `markDelivered`, `markFulfilmentComplete`, `markUndeliverable`) and fulfilment/stock functions (`shipStock`, `releaseStock`, `refreshShelf`) through `orderService`.
- **`scenarios/flows/shop-history.ts`** — reads order history via `orderBriefsByIds` / `findManyByIds` / `search`.
- **`src/modules/cart/tests/integration/checkout-stock-divergence.test.ts`** and **`stock.test.ts`** — exercise the stock-related surface (`shipStock`, `topUpStock`, `releaseStock`, `refreshShelf`) of `orderService`.

## Notes

- The file is a **re-export only**; all logic lives in the sibling sub-files (`./place`, `./status`, `./fulfillment`, etc.). Adding a new service function means editing the sub-file *and* adding it to the `orderService` object here.
- The config getters (`orderFrontendLink`, `withdrawalPeriodDays`) are re-exported here rather than from `../index.ts` due to the `local/barrel-allowed-sources` rule (a module barrel may only publish services/domain/events/emails/model).
- `placeOrder` is explicitly documented as the **only** function that writes a new order; all other mutation functions assume an existing order ID.
- All read paths are expected to go through `scope.ts` (`callerScope`, `ownerScope`, `ownLiveScope`) for authorization; calling raw `getById` without a scope check is a convention violation.
