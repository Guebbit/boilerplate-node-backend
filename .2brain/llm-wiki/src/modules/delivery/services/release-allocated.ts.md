---
source: src/modules/delivery/services/release-allocated.ts
sha256: c90e02546923397ac3841fe63611ac15fa0946778d3629f54bed5a7b2f61f46b
generated_at: 2026-10-14T15:32:49.955016+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/release-allocated.ts

## Purpose

Event listener for inventory's allocation announcement: when stock arrives and inventory allocates a receipt to a paid preorder, this module moves the allocated units out of `awaiting_stock` by calling `splitForAllocation` on the matching fulfillment orders. It exists to close the loop between "paid preorder waiting for stock" and "stock is actually available."

## Key elements

- **`releaseAllocated(orderId, productId, waiting)`** *(exported)* — Entry point. Ensures fulfillment orders exist, finds the ones holding the product for stock, then releases `total − waiting` units across them (oldest promise first) via sequential `splitForAllocation` calls.
- **`heldFor(orderId, productId)`** *(internal)* — Queries `fulfillmentOrderRepository.findByOrderId`, filters to `on_hold` / `awaiting_stock` lines with remaining units for the product, and sorts by `agreedAt` then `number` (oldest promise first).
- **`waitingOn(fulfillmentOrder, productId)`** *(internal)* — Sums `remainingOfLine` across all lines of a given product on a single fulfillment order.

## Relationships

- **`src/modules/delivery/services/ensure.ts`** — Calls `ensureFulfillmentOrders` before proceeding; guards against the race where the paid-listener hasn't created the orders yet.
- **`src/modules/delivery/services/split.ts`** — Calls `splitForAllocation` per held order to actually move units out of `awaiting_stock`.
- **`src/modules/delivery/repository.ts`** — Reads fulfillment orders via `fulfillmentOrderRepository.findByOrderId`.
- **`src/modules/delivery/domain/fulfillment.ts`** (via `domain/index.ts`) — Uses `remainingOfLine` to compute per-line outstanding quantities.
- **`src/modules/delivery/model.ts`** — Types the `FulfillmentOrderDocument` shape read from the repository.
- **`src/types/index.ts`** — Imports `FulfillmentHoldReason` and `FulfillmentOrderStatus` enums.
- **`src/modules/delivery/services/index.ts`** — Re-exports `releaseAllocated` to the module's public surface.
- **`src/modules/delivery/tests/integration/preorder.test.ts` / `tests/unit/fulfillment.test.ts`** — Exercise this listener in end-to-end and unit scenarios.

## Notes

- **Idempotent by state, not delta.** The incoming `waiting` parameter is the order's *current* outstanding claim (a snapshot), not a change. Re-delivering the same event yields `toRelease ≤ 0` and no-op's.
- **Sequential awaits are intentional.** The `for…of` loop awaits each `splitForAllocation` because each call rewrites the same order's summary line; parallelizing would cause lost writes.
- **`agreedAt ?? 0` fallback.** Orders without an `agreedAt` sort before those that have one (treated as epoch 0), then tiebreak by `number`.
