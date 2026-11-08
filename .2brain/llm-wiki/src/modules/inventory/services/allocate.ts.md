---
source: src/modules/inventory/services/allocate.ts
sha256: b3e903e2528e55abe8121033bb98e1cfab3490ab8c55c35779f7766f243d166b
generated_at: 2026-11-08T06:01:56.304178+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/allocate.ts

## Purpose

Allocates newly-arrived stock to paid preorders (backorders), oldest payment first. It converts a preorder's `backorder` claim into a real `stock` hold on actual units, decrementing `available` while leaving the shelf count untouched. Everything runs inside the caller's transaction so units are never visible as sellable to anyone else between arrival and allocation.

## Key elements

- **`allocateWithin(productIds, session)`** — the sole export. Iterates the given product IDs sequentially, allocates each one's free units across its paid-preorder queue, then enqueues one `PREORDER_ALLOCATED` outbox event per served order/product pair. Returns the list of `Allocation` results.
- **`allocateProduct(productId, session)`** (internal) — reads the stock level, walks the paid-preorder holds for that product, and for each hold applies a transition, rewrites the hold's items, and tracks how much was served vs. still waiting.
- **`withAllocated(hold, productId, quantity)`** (internal) — rebuilds a hold's `StockLine[]` by moving `quantity` of the target product from `kind: 'backorder'` to `kind: 'stock'`, keeping the two kinds as separate lines so later ship/release can distinguish them.
- **`Allocation`** (internal interface) — per-order result: `orderId`, `productId`, `quantity` (units served), `waiting` (units still outstanding after this allocation).

## Relationships

- **`src/modules/inventory/repository.ts`** — reads the product's stock level (`stockLevelRepository.findByProductId`) and the paid-preorder holds (`reservationRepository.findPaidPreorderHolds`); writes back via `reservationRepository.replaceItems`.
- **`src/modules/inventory/services/transition.ts`** — calls `applyTransition` with `StockMovementReason.allocate` to perform the actual counter decrement.
- **`src/kernel/outbox.ts`** — calls `enqueueOutboxEvent` to record a `PREORDER_ALLOCATED` event per allocation within the same transaction.
- **`src/modules/inventory/events.ts`** — imports the `PREORDER_ALLOCATED` event name.
- **`src/modules/inventory/services/types.ts`** — imports the `StockLine` shape used to rebuild hold items.
- **`src/modules/inventory/model.ts`** — imports `ReservationDocument` (the Mongoose document shape for holds).
- **`src/types/index.ts`** — imports `StockMovementReason` enum.

## Notes

- The function is named **`allocateWithin`**, not `allocate` — search by that exact name.
- Products are processed **sequentially** (`for…of`), not in parallel, because a Mongoose transaction session does not tolerate concurrent operations.
- `Allocation.waiting` is the **remaining** backorder after this allocation, not the total owed. A value of `0` means the order is fully covered.
- If `applyTransition` returns a falsy result (counters refused), the function **throws** rather than skipping — within a correctly-scoped transaction this is expected to be impossible, so a failure signals a bug.
- `withAllocated` merges all `stock`-kind lines for the same product into a single line (the `stock` accumulator), but always emits `backorder` and `stock` as **separate** lines.
- The file does not open its own transaction; the caller (e.g. the receipt/ingest flow) supplies the `ClientSession`.
