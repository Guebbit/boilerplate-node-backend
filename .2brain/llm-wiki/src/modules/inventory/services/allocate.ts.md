---
source: src/modules/inventory/services/allocate.ts
sha256: b3e903e2528e55abe8121033bb98e1cfab3490ab8c55c35779f7766f243d166b
generated_at: 2026-10-29T04:03:06.552945+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/allocate.ts

## Purpose

Serves arrived stock to paid preorders (oldest payment first) inside the receipt's own transaction, converting `backorder` claim lines into real `stock` hold lines. It exists so units never appear sellable to an outside buyer in the gap between receipt and allocation.

## Key elements

- **`allocateWithin(productIds, session)`** — the sole export. Iterates de-duplicated product IDs sequentially, calls `allocateProduct` for each, then enqueues one `PREORDER_ALLOCATED` outbox event per served (order, product) pair. Returns the full `Allocation[]`.
- **`allocateProduct(productId, session)`** — (internal) reads the stock level, walks the product's paid-preorder holds in queue order, and for each hold computes `min(waiting, free)`, applies the stock transition, and rewrites the hold's items via `withAllocated`. Throws if the transition counters refuse.
- **`withAllocated(hold, productId, quantity)`** — (internal) rebuilds the hold's `StockLine[]` for one product: converts up to `quantity` units from the `backorder` line into the `stock` line, leaving any remainder as `backorder`. Other products and existing `stock` lines are preserved unchanged.
- **`Allocation`** — (internal interface) `{ orderId, productId, quantity, waiting }` where `waiting` is the *remaining* unallocated quantity after this allocation.

## Relationships

- **`src/modules/inventory/services/transition.ts`** — calls `applyTransition(StockMovementReason.allocate, …)` to decrement `available` and record the movement atomically.
- **`src/modules/inventory/repository.ts`** — reads `stockLevelRepository.findByProductId` and `reservationRepository.findPaidPreorderHolds` / `replaceItems`.
- **`src/modules/inventory/services/types.ts`** — imports the `StockLine` shape used by `withAllocated`.
- **`src/modules/inventory/model.ts`** — imports the `ReservationDocument` type for the hold parameter.
- **`src/modules/inventory/events.ts`** — imports the `PREORDER_ALLOCATED` event constant.
- **`src/kernel/outbox.ts`** — calls `enqueueOutboxEvent` to publish one event per allocation within the same session.
- **`src/types/index.ts`** — imports `StockMovementReason.allocate` as the movement reason.

## Notes

- **Sequential, not parallel.** A Mongoose `ClientSession` serialises operations; the `for…of` loop and the `new Set(productIds)` dedup are intentional, not incidental. Do not parallelise.
- **`waiting` is a remainder, not a total.** In each `Allocation` the `waiting` field equals `originalWaiting − quantity`, so a value of `0` means fully served and `> 0` means the order still awaits more units.
- **Backorder and stock lines coexist.** `withAllocated` deliberately keeps them as separate `StockLine` entries for the same `productId` so downstream ship/release can distinguish pre-allocated from newly-arrived stock.
- **Fail-fast on counter refusal.** If `applyTransition` returns falsy the function throws; the transaction (owned by the caller) will roll back the receipt and any prior allocations in the same loop.
- **Caller owns the transaction.** This module never begins or commits a session; it only receives one. The receipt flow (typically in `admin.ts` or the receipt handler) is responsible for `startSession` / `commit`.
