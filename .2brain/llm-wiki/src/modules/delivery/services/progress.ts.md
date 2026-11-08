---
source: src/modules/delivery/services/progress.ts
sha256: 2f885683f0819701b030b7d5e1898beb277a539ebd3099bf7255530428058736
generated_at: 2026-11-08T05:38:15.722599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/progress.ts

## Purpose

Keeps the `orders` module's status in sync with what a delivery act has written, inside that act's transaction. It recomputes the fulfillment summary from the fulfillment orders and shipments (never adjusts it incrementally) and drives the order's status machine forward — `paid → processing → shipped → delivered`, or `processing → canceled` for lost parcels. `orders` remains the sole status writer; this file only asks it to move and refuses the act when it cannot.

## Key elements

- **`ProgressReport`** (interface) — Describes what `reportProgress` read and wrote: the order post-summary-write, the computed summary, and the fulfillment orders and shipments that fed it.
- **`reportProgress(orderId, session)`** — Reads fulfillment orders then shipments sequentially under the act's session, calls `summarize`, and hands the result to `orderService.recordFulfillmentProgress`. Refuses the act (409 `DELIVERY_NOT_SHIPPABLE`) if the order is no longer shippable.
- **`startFulfillment(order, session, actor)`** — Moves the order `paid → processing` within the act. No-op (no throw) if the order is already past `paid`; refuses (409 `ORDER_NOT_PAID`) if `markProcessing` fails.
- **`settleOrder(orderId, status, summary, at, session, actor?)`** — Advances the order status when the summary says it is due: `processing → shipped`, `shipped → delivered`, the double move `processing → delivered` (digital fulfillment or remainder canceled after all arrivals), or `processing → canceled` (lost parcel). Returns a post-commit callback for the canceled case; the caller invokes it after the transaction commits.
- **`expectMoved(moved)`** (private) — Aborts the act (409 `ORDER_NOT_PROCESSING`) if a status transition did not land.

## Relationships

- **`src/modules/delivery/domain/index.ts` / `fulfillment.ts`** — Imports `summarize` (recomputes the `FulfillmentReport` from records) and the `FulfillmentReport` type.
- **`src/modules/delivery/repository.ts`** — Imports `fulfillmentOrderRepository` and `shipmentRepository` to read the records the summary is built from.
- **`src/modules/delivery/model.ts`** — Imports `FulfillmentOrderDocument` and `ShipmentDocument` types for typing the repository results.
- **`src/modules/delivery/services/act.ts`** — Imports `refuse`, the mechanism by which every failure path in this file aborts the surrounding act.

## Notes

- Reads are strictly sequential (`findByOrderId` → `findByOrderId`), not parallel, because a Mongoose `ClientSession` does not support concurrent operations within one transaction.
- `startFulfillment` is deliberately a no-op (not an error) when the order is already past `paid`; it only throws when `markProcessing` returns falsy.
- `settleOrder`'s "double move" path (`processing → delivered`) skips the `shipped` state entirely; this is intentional for digital fulfillment and for a remainder canceled after every shipment already arrived.
- The lost-parcel path (`processing → canceled`) is the only case where `settleOrder` returns a non-undefined value: a `reportCanceled` callback the caller must invoke after the act commits.
- The summary is always derived fresh from records; this file never mutates or patches a previously stored summary.
