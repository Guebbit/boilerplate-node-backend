---
source: src/modules/inventory/services/index.ts
source_sha256: 17ada0f8a657310d8a0f50a576372c50ef7bb0773d9a22102e979ba2e99e4dfc
context_sha256: ffb49dc1b87a511711c65a1951ba8571fea7c51b543553a1c3b109046e16c66e
generated_at: 2026-11-22T05:22:28.491877+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/index.ts

## Purpose
Barrel file for the inventory module's service layer. It gathers the per-flow functions (reserve, holds, top-up, returns, sweep, levels, admin, availability) into a single `inventoryService` object and re-exports the public types. The header states the module's invariant: it is the only place stock changes, and a counter never moves without a ledger row. Both halves happen inside `applyTransition`, which every function goes through.

## Key elements
- `inventoryService`: the module's one service handle. It contains no logic of its own, only the functions below, grouped by source file:
  - **Reserve / top-up**: `reserveForOrder` (`./reserve`), `reserveMoreForOrder` (`./top-up`).
  - **Holds** (`./holds`): `commitForOrder`, `retakeReleasedForOrder`, `shipForOrder`, `shipLinesForOrder`, `releaseLinesForOrder`, `releaseTopUpForOrder`, `releaseForOrder`, `releaseCommittedForOrder`, `forgetAvailabilityForOrder`, `extendHoldForOrder`, `isStockBoundToOrder`, `isHoldReleased`.
  - **Returns**: `restockReturnedLines` (`./returns`).
  - **Sweep**: `runReservationSweep` (`./sweep`).
  - **Availability** (`./availability`): `availabilityOfProducts`, `forgetAvailability`.
  - **Levels / reads** (`./levels`): `availableFor`, `getLevel`, `listLevels`, `listPreorders`, `lowStockCount`, `listMovements`.
  - **Admin** (`./admin`): `receive`, `adjust`, `setBackorderLimit`.
- Type re-exports: `RetakeOutcome` (from `./holds`), and `StockLine`, `TopUp`, `StockShortfall`, `ReserveOutcome`, `StockPosition`, `LevelFilters`, `MovementFilters` (from `./types`).

## Relationships
- The cart services `checkout.ts`, `shelf.ts` and `view.ts` are neighbors in the dependency graph. The file's content does not show which functions they call.
- Cart integration tests cover backorder, checkout expected total, merge, preorder, stock-flag and stock behavior. Delivery integration tests cover backorder, lost-parcel, override-sync, preorder-board and preorder, and the delivery `factories.ts` is also a neighbor. All of these sit in the graph around this handle.

## Notes
- The header says transactions are used only where a half-done write would be wrong:
  - a hold's claim and commit (`holds.ts`);
  - a delivery with its preorder allocation (`admin.ts`);
  - a hold's release with its announcement (`sweep.ts`).
- All other functions are conditional single-document writes. Gaps are documented at the call sites that own them.
- The code is split into one file per flow rather than one large file.
