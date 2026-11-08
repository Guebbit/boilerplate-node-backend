---
source: src/modules/inventory/services/top-up.ts
sha256: a59750fe4e629fddaebb6fa9fc30e331dd4a07d0f420e6fde84ae84e1197f2f9
generated_at: 2026-11-08T06:03:53.601847+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/top-up.ts

## Purpose

Re-reserves inventory for an order whose parcel was reported lost. Because the original units already left the shelf at shipment, this module splits each line into a **shelf** portion (drawn from currently available stock) and an **owed** portion (claimed as a backorder outside the new-sale cap), then records both on the order's hold. It exists to honour a promise the shop already made without double-counting units held for other orders.

## Key elements

- **`reserveMoreForOrder`** *(exported)* — Main entry point. Iterates the lost-parcel lines in `productId` order, calls `takeOne` for each, converts the results to hold lines via `linesOf`, and persists them with `reservationRepository.topUpItems`. Throws if any counter or the hold refuses a write.
- **`takeOne`** *(module-private)* — For a single `StockLine`, reads the stock level, computes `shelf = min(available, quantity)` and `owed = quantity − shelf`, then calls `applyTransition` with `StockMovementReason.reserve` and `StockMovementReason.owed` respectively. Returns `{ productId, shelf, owed }`.
- **`linesOf`** *(module-private)* — Maps `TopUp[]` results into `HoldLine[]`: shelf units become plain stock holds; owed units become `kind: 'backorder'` holds.
- **`NOTES`** *(module-private const)* — Ledger note strings stamped onto the two transition types for audit.

## Relationships

- **`src/modules/inventory/services/transition.ts`** — calls `applyTransition` to perform the actual stock-counter writes for both shelf and owed movements.
- **`src/modules/inventory/repository.ts`** — reads stock levels (`stockLevelRepository.findByProductId`) and persists the updated hold (`reservationRepository.topUpItems`).
- **`src/modules/inventory/domain/index.ts`** — uses the `HoldLine` type to shape the lines written to the reservation.
- **`src/modules/inventory/services/types.ts`** — consumes the `StockLine` (input) and `TopUp` (output) shapes.
- **`src/types/index.ts`** — imports `StockMovementReason` enum values (`reserve`, `owed`).
- **`src/modules/inventory/services/index.ts`** — barrel re-exports this module alongside sibling services.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — unit-tests the lost-parcel flow that exercises this function.

## Notes

- Lines are processed in **`productId` locale-sorted order** (`toSorted`, non-mutating) so that concurrent losses on the same products always acquire locks in the same sequence, preventing deadlock.
- The **owed** portion deliberately bypasses the backorder/preorder cap; that cap governs *new* sales, not a commitment already made to the customer.
- A product with **no stock level** (e.g. deleted) short-circuits to `{ shelf: 0, owed: 0 }` — nothing is claimed and no transitions are written.
- The **caller** owns the Mongoose transaction (`session`) and is responsible for refreshing the catalogue's stock cache after committing; this module does not manage the session lifecycle.
- `reservationRepository.topUpItems` reopens a hold that has already ended, restoring it to `committed` status while preserving its original position in the preorder queue.
