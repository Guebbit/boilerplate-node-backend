---
source: src/modules/orders/services/index.ts
sha256: 053601204b64133e0cba07c12174353876890ce5b185c7669fbe2abbe67df4d7
generated_at: 2026-11-08T06:58:01.369334+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/index.ts

## Purpose

Barrel and facade for the entire Order service layer. It re-exports every sub-service (read, write, status, fulfillment, cancellation, timeline, stats, retention, etc.) into a single `orderService` object, which is the **only** entry point a controller or cross-module caller may use. This enforces the project's layering rule: one file per flow, one public surface.

## Key elements

- **`orderService`** — the exported const object aggregating ~70 named functions. Every external caller imports and calls through this single object rather than reaching into individual sub-files.
- **Re-exported types** — `OrderBrief`, `PlaceOrderInput`, `PlaceOrderLine`, `PlaceOrderOutcome`, `CancelCause`, `OrderExport`, and stats read-model types, so callers never import from sub-files directly.
- **Config re-exports** — `orderFrontendLink`, `orderPagePath`, `withdrawalPeriodDays` from `../config`, re-published here because the module barrel is restricted to services/domain/events/emails/model sources (see `local/barrel-allowed-sources`).
- **Sub-service imports (grouped by concern):**
  - *Read / scope:* `search`, `getById`, `getForCaller`, `callerScope`, `ownerScope`, `ownLiveScope`, `findOwnOrders`, `orderBriefsByIds`, etc.
  - *Write (single door):* `placeOrder` (from `place.ts`), `create`, `updateById`.
  - *Lifecycle / status:* `markPaid`, `markShipped`, `markDelivered`, `markFulfillmentComplete`, `markUndeliverable`, `overrideStatus`, etc.
  - *Fulfillment / stock:* `shipStock`, `topUpStock`, `releaseStock`, `extendHold`, `isPayableNow`, `refreshShelf`.
  - *Cancellation:* `cancelOnRequestById`, `withdrawById`, `expireReservationById`, `cancelForPaymentMismatchById`.
  - *Retention / PII:* `detachUserId`, `eraseUserOrders`, `anonymizeDueOrders`, `startOrderPiiClock`.
  - *Timeline:* `appendTimeline`, `readTimeline`, `scrubTimelineText`, `collectTimelineOf`, etc.
  - *Stats / analytics:* `paidBuckets`, `productTotals`, `pipeline`, `cancellationCohort`, etc.
  - *Misc:* `reencryptOrders`, `freezeOrderLines`, `correctShippingAddress`, `openOrderExport`, `extendGuarantee`.

## Relationships

- **`src/modules/cart/services/checkout.ts`** and **`src/modules/cart/controllers/post-checkout.ts`** — call `orderService.placeOrder` (the sole write door) and `orderService.considerPurchaseHold` when a cart is converted to an order.
- **`src/modules/cart/services/reorder.ts`** — reads prior orders via `orderService.getById` / `orderService.findManyByIds` to reconstruct lines for a new order.
- **`src/modules/delivery/services/act.ts`** — drives status transitions through `orderService.markProcessing`, `markShipped`, `markDelivered`, `markFulfillmentComplete`, `markUndeliverable`.
- **`src/modules/delivery/services/cut.ts`** — interacts with stock via `orderService.shipStock`, `orderService.topUpStock`, `orderService.releaseStock`, `orderService.releaseTopUp`.
- **`src/modules/delivery/services/deliver.ts`** — finalises delivery state via `orderService.markDelivered` and `orderService.markFulfillmentComplete`.
- **`src/modules/delivery/services/cancel-remainder.ts`** — calls `orderService.releaseStock` / `orderService.releaseTopUp` to free stock on partial fulfilment.
- **`src/modules/delivery/services/digest.ts`** — reads `orderService.ordersDigest` / `orderService.shippingMethodsOf` for reporting.
- **`src/modules/delivery/services/ensure.ts`** — checks order readiness via `orderService.isPayableNow` and scope helpers.
- **`scenarios/flows/shop-history.ts`** — consumer of read paths (`orderService.search`, `orderService.findOwnOrders`, `orderService.readTimeline`) to render a buyer's order history.
- **`src/modules/cart/tests/integration/checkout-stock-divergence.test.ts`** and **`src/modules/cart/tests/integration/stock.test.ts`** — integration tests that exercise `orderService` placement and stock methods end-to-end.

## Notes

- **Single write door.** The file header states explicitly that `place.ts` (`orderService.placeOrder`) is the *only* function that creates a new order. Do not add parallel creation paths.
- **Scope is mandatory for reads.** The header notes that `scope.ts` gates every read; callers must use `getForCaller` / `ownerScope` / `ownLiveScope` rather than raw `getById` when the actor's permissions matter.
- **Barrel restriction.** Config getters are re-exported *from here* instead of `../index.ts` because the module's public barrel may only publish services, domain, events, emails, or model symbols. Do not add non-service exports to this file.
- **One-file-per-flow convention.** The header references `docs/theory/layers.md`: each sub-concern lives in its own file under `./`; this index only aggregates. Do not implement new logic in this file.
