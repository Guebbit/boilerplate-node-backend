---
source: src/modules/delivery/services/release-allocated.ts
sha256: c90e02546923397ac3841fe63611ac15fa0946778d3629f54bed5a7b2f61f46b
generated_at: 2026-11-08T05:38:50.326612+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/release-allocated.ts

## Purpose

EventListener that moves units out of `awaiting_stock` when `inventory` announces a receipt has been allocated to a paid preorder. It receives the post-allocation **state** (`waiting`: what the order still claims) rather than a delta, so it is naturally idempotent on redelivery.

## Key elements

- **`releaseAllocated(orderId, productId, waiting)`** *(exported)* — Entry point. Ensures fulfillment orders exist, finds the held orders for the product, computes how many units to release (`total − waiting`), then walks them oldest-promise-first, calling `splitForAllocation` for each.
- **`waitingOn(fulfillmentOrder, productId)`** *(internal)* — Sums `remainingOfLine` across lines matching the product to get the order's outstanding claim.
- **`heldFor(orderId, productId)`** *(internal)* — Queries the repository for orders in `on_hold` / `awaiting_stock` that still claim the product, sorted by `agreedAt` (then `number` as tiebreaker).

## Relationships

- **`./split`** — Calls `splitForAllocation` to actually move each allocated batch out of `awaiting_stock`.
- **`./ensure`** — Calls `ensureFulfillmentOrders` first, because the paid listener may not have created the orders yet.
- **`../repository`** — Uses `fulfillmentOrderRepository.findByOrderId` to load candidate orders.
- **`../domain`** — Uses `remainingOfLine` to compute per-line outstanding quantities.
- **`../model`** — Reads `FulfillmentOrderDocument` shape (lines, status, holdReason, agreedAt, number).
- **`@types`** — Consumes `FulfillmentHoldReason.awaiting_stock` and `FulfillmentOrderStatus.on_hold`.
- **`./index.ts`** — Re-exports `releaseAllocated` for external consumers.
- **`tests/contract/ownership-shop.contract.test.ts`** — Exercises the allocation → release flow end-to-end.

## Notes

- **Idempotency is structural, not bookkeeping.** Because the event carries the post-allocation `waiting` count, a duplicate delivery simply yields `toRelease = 0` and the loop breaks immediately.
- **Sequential, not parallel.** The `for…of` + `await` is intentional: each `splitForAllocation` rewrites the same order's summary, so concurrent splits would race.
- **`agreedAt` may be absent.** Sorting uses `a.agreedAt?.getTime() ?? 0`, treating missing dates as epoch-earliest.
- **Guards on the paid path.** `ensureFulfillmentOrders` is called unconditionally before the query; it is itself idempotent, so repeated calls are safe.
