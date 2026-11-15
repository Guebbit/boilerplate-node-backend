---
source: src/modules/delivery/services/progress.ts
sha256: d5ca125c1213aa3b3fae8423ef4f3dca9e8952f0e36caa7214d172e21bb944f4
generated_at: 2026-11-14T19:49:02.045077+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/progress.ts

## Purpose

Bridge between delivery acts and the `orders` module. Inside an act's Mongoose transaction it recomputes the fulfillment summary from the delivery records themselves (never mutates it) and asks `orders` to move its status accordingly. `orders` remains the sole status writer; this file only requests the move and refuses the act when the order can no longer fulfil.

## Key elements

- **`ProgressReport`** (interface) — the read/write snapshot returned by `reportProgress`: the order document, the recomputed `FulfillmentReport`, and the fulfillment orders and shipments as seen by the act.
- **`reportProgress(orderId, session)`** — reads fulfillment orders and shipments sequentially (session constraint), calls `summarize` to build the summary, then delegates to `orderService.recordFulfillmentProgress`. Refuses the act (409 `DELIVERY_NOT_SHIPPABLE`) if the order is no longer shippable.
- **`startFulfillment(order, session, actor)`** — performs the `paid → processing` transition via `orderService.markProcessing` when the order is still `paid`. No-op if already past `paid`; refuses (409 `ORDER_NOT_PAID`) if the order moved away from `paid` since the read.
- **`settleOrder(orderId, at, session, actor)`** — asks `orderService.settleFulfillment` to pick the correct status edge (shipped, delivered, both, or lost-parcel cancel). Refuses (409 `ORDER_NOT_PROCESSING`) if the expected move didn't land. May return a post-commit callback when the settlement canceled the order (lost parcel); the caller owns the transaction and invokes it after commit.

## Relationships

- **`src/modules/delivery/domain/fulfillment.ts` / `src/modules/delivery/domain/index.ts`** — imports `summarize` and the `FulfillmentReport` type; the summary passed to `orders` is produced by this module.
- **`src/modules/delivery/repository.ts`** — imports `fulfillmentOrderRepository` and `shipmentRepository` to read the records the summary is computed from.
- **`src/modules/delivery/model.ts`** — imports `FulfillmentOrderDocument` and `ShipmentDocument` types for the `ProgressReport` shape.
- **`src/modules/delivery/services/act.ts`** — imports the `refuse` helper; every failure path throws an `ActRefusal` that aborts the act's transaction.
- **`src/modules/delivery/services/ship.ts`, `src/modules/delivery/services/deliver.ts`, `src/modules/delivery/services/cancel-remainder.ts`, `src/modules/delivery/services/lost.ts`, `src/modules/delivery/services/reship.ts`, `src/modules/delivery/services/split.ts`, `src/modules/delivery/services/fulfill.ts`, `src/modules/delivery/services/ensure.ts`, `src/modules/delivery/services/holds.ts`, `src/modules/delivery/services/override-sync.ts`** — sibling act services that call the three exports above (typically `startFulfillment` → `reportProgress` → `settleOrder`) within their own transaction.

## Notes

- **Sequential, not parallel, reads.** Mongoose transaction sessions do not support concurrent operations, so `reportProgress` chains two `.then()` calls rather than `Promise.all`.
- **Ordering contract.** `startFulfillment` runs *before* `reportProgress`, and `reportProgress` runs *before* `settleOrder`, so settlement always sees the order in `processing`.
- **Summary is always recomputed, never adjusted.** This file never writes to delivery collections; it only reads them and hands the result to `orders`.
- **`settleOrder` can return a callback.** Callers must hold onto it and invoke it after their transaction commits (used for the lost-parcel cancellation path).
