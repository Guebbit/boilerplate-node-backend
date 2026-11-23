---
source: src/modules/orders/services/index.ts
source_sha256: cbcf3e5b15dea9ada644d2b2ec6daf005b0725966015ec5deab87e2a03668424
context_sha256: b9cc9a2ef7971951c3144622c3415f9348b881dc8febb4df843af1fa73291fd4
generated_at: 2026-11-22T06:21:04.519713+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/index.ts

## Purpose
Barrel for the Order service. It imports the per-flow service files (one file per flow) and publishes them as a single `orderService` object, which is the only entry point controllers and other modules may use to reach order business logic. It contains no logic of its own.

## Key elements
- `orderService`: object aggregating all order operations, grouped by the source file they come from:
  - **Reads/scope**: `search`, `getById`, `getForCaller`, `findManyByIds`, `ownOrderIds`, `findOwnOrders`, `orderBriefsByIds`, `openUnpaidOrderIds`, `billingAddressOf`, `shippingAddressOf` (`./read`); `callerScope`, `cancelScope`, `actorOf`, `ownerScope`, `ownLiveScope` (`./scope`); `ordersDigest`, `shippingMethodsOf` (`./digest`).
  - **Writes**: `placeOrder` (`./place`, the single write path for new orders), `create`, `recordCreated`, `updateById` (`./crud`), `removeById`, `restoreById` (`./remove`), `freezeOrderLines` (`./snapshot`), `reencryptOrders`.
  - **Cancellation/withdrawal**: `cancelOnRequestById`, `withdrawById`, `withdrawWithin`, `expireReservationById`, `cancelForPaymentMismatchById` (`./cancel`), plus `mailOrderCanceled`.
  - **Status**: `markProcessing`, `settleFulfillment`, `reopenForFulfillment`, `markPaymentStatus`, `markReturnStatus`, `markMoneyReceived` (`./status`); `overrideStatus` (`./override`); `extendGuarantee`.
  - **Fulfillment/stock**: `readOrder`, `recordFulfillmentProgress`, `shipStock`, `topUpStock`, `releaseStock`, `releaseTopUp`, `extendHold`, `isPayableNow`, `refreshShelf` (`./fulfillment`); `considerPurchaseHold`.
  - **Notifications**: `mailOrderPlaced`, `mailBuyer`, `mailBuyerOfOrder` (`./notify`).
  - **Address corrections**: `correctShippingAddress`, `correctBillingAddress`.
  - **Export/timeline/notes**: `openOrderExport`; `appendTimeline`, `addNote`, `deleteNote`, `readTimeline`, `collectTimelineOf`, `clearTimelineActor`, `scrubTimelineText`.
  - **Retention/PII**: `detachUserId`, `eraseUserOrders`, `startOrderPiiClock`, `anonymizeDueOrders`.
  - **Stats**: `paidBuckets`, `productTotals`, `categoryTotals`, `productSeries`, `customerCounts`, `cancellationCohort`, `pipeline`.
  - **Actions**: `withActions`, `withListActions`.
- Type re-exports: `OrderBrief`, `PlaceOrderInput`, `PlaceOrderLine`, `PlaceOrderOutcome`, `PlaceOrderShipping`, `CancelCause`, `OrderExport`, and the stats types (`PaidBucket`, `ProductTotal`, `CategoryTotal`, `ProductSeriesRead`, `AwaitingTransfers`, `PipelineRead`).
- Config re-exports: `orderFrontendLink`, `orderPagePath`, `withdrawalPeriodDays` (from `../config`).

## Relationships
- Imports from sibling files in `src/modules/orders/services/` (`read`, `crud`, `place`, `cancel`, `status`, `fulfillment`, `timeline`, `stats`, `scope`, etc.) and from `../config`.
- Consumers listed in the graph call into this surface: the cart module (`src/modules/cart/controllers/post-checkout.ts`, `src/modules/cart/services/checkout.ts`, `src/modules/cart/services/reorder.ts`, and its `src/modules/cart/tests/integration/stock.test.ts` integration test), the delivery module (`src/modules/delivery/module.ts` and the `src/modules/delivery/services/` files `act`, `announce`, `board`, `cancel-remainder`, `cut`, `deliver`, `digest`, `ensure`, `found`), and the `scenarios/flows/shop-history.ts` scenario.

## Notes
- Config getters are re-exported here rather than from the module's own public barrel (the parent-directory index) because a module's public barrel may only publish services, domain, events, emails and model (lint rule `local/barrel-allowed-sources`).
- Per the header, `place.ts` is the sole function that writes a new order, and `scope.ts` governs visibility, so every read is meant to go through it.
