---
source: src/modules/inventory/services/allocate.ts
source_sha256: 7e3c9a0e9ff099079ed9fd06be48fcf0f787a4e02f4e4d3942a65cd914582d60
context_sha256: fbaa6aca0c6774da31668439c88e9b2286b944556bdd742e1d4748e60124a847
generated_at: 2026-11-22T05:21:33.757843+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/allocate.ts

## Purpose
Hands newly arrived stock to paid preorders waiting for it, oldest payment first. It runs inside the stock receipt's own transaction, so units are never sellable by others between arriving and being allocated. A paid preorder's claim (`backordered`) becomes a real hold (`reserved`) on real units: `available` drops by the allocated amount, the shelf count is unchanged, and the order's hold carries those units as ordinary `stock` lines that ship, restock and release like any other.

## Key elements
- `allocateWithin(productIds, session)` (exported): de-duplicates product IDs and allocates them one at a time, since a transaction session can't run parallel operations. It then enqueues one `PREORDER_ALLOCATED` outbox event per order and product served, with payload `{ orderId, productId, waiting }`, and returns the allocations.
- `allocateProduct(productId, session)` (internal): loads the product's stock level and returns `[]` if there is no level, nothing is `backordered`, or nothing is `available`. Otherwise it walks the paid preorder holds in the order the repository returns them. For each hold it sums the `backorder` quantity for that product and allocates `min(waiting, free)`. It does so by calling `applyTransition` with the `allocate` stock movement reason and `{ reference: orderId }`. Then it rewrites the hold's items through the reservation repository.
- `withAllocated(hold, productId, quantity)` (internal): builds the hold's new item list. It shrinks or drops the product's `backorder` line, merges the allocated units into a single `stock` line for that product, and passes other products' lines through (a missing `kind` defaults to `stock`).
- `Allocation` (internal interface): `{ orderId, productId, quantity, waiting }`, where `waiting` is what the order still lacks after this allocation.

## Relationships
- `src/modules/inventory/repository.ts`: provides the stock level and reservation repositories used to load the stock level, find paid preorder holds, and replace a hold's items.
- `src/modules/inventory/services/transition.ts`: `applyTransition` performs the actual counter movement for the `allocate` reason.
- `src/modules/inventory/model.ts`: `ReservationDocument` type for holds.
- `src/modules/inventory/services/types.ts`: `StockLine` shape for rebuilt hold items.
- `src/modules/inventory/events.ts`: `PREORDER_ALLOCATED` event name.
- `src/kernel/outbox.ts`: `enqueueOutboxEvent` records events in the same transaction.
- `src/types/index.ts`: provides `StockMovementReason`, whose `allocate` member is passed to `applyTransition`.

## Notes
- If `applyTransition` returns a falsy result, it throws an error ("the counters refused"). This presumably aborts the caller's transaction.
- Backorder and stock lines of the same product stay as separate lines, so a later ship or release can name which one it means.
- Events are written only after all products are allocated, and carry the remaining `waiting`, not the allocated quantity.
- Hold order depends on what the repository's paid-preorder lookup returns. The file itself relies on it for the "oldest payment first" behaviour.
