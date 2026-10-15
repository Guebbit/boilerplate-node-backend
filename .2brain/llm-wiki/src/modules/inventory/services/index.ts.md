---
source: src/modules/inventory/services/index.ts
sha256: 060b537ededb2a31f529b0096fb867149d110e3d0fb524a91047aba087af50e6
generated_at: 2026-10-15T10:36:15.182522+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/index.ts

## Purpose

Barrel (re-export) file for the inventory service. It aggregates the public API of the `./reserve`, `./holds`, `./returns`, `./transition`, `./sweep`, `./levels`, and `./admin` sub-modules into a single import surface and also exposes them as a grouped `inventoryService` object. It exists so callers (controllers, cart services, ops scripts, tests) have one stable entry point rather than reaching into individual sub-files.

## Key elements

- **Named re-exports** — every function from the sub-modules is re-exported by name (e.g. `reserveForOrder`, `commitForOrder`, `releaseForOrder`, `availableFor`, `receive`, `adjust`, `runReservationSweep`, etc.). This flat surface is relied on by `module.ts`, `metrics.ts`, and the test suites directly.
- **Type re-exports** — `StockLine`, `StockShortfall`, `ReserveOutcome`, `LevelFilters`, `MovementFilters` from `./types`.
- **`inventoryService` (const object)** — a single handle that groups all runtime functions (including `isStockBoundToOrder`, `isHoldReleased`, which are *not* in the named export list) for callers that prefer a single reference.
- **Doc block** — states the invariant that stock changes and ledger rows are always paired inside `applyTransition` (lived in the sub-modules, not this file), and that no Mongo transactions are used.

## Relationships

- **`src/modules/cart/services/checkout.ts`** — consumes reservation/commit/release functions (e.g. `reserveForOrder`, `commitForOrder`, `releaseForOrder`) to lock and release stock during order lifecycle.
- **`src/modules/cart/services/shelf.ts` / `view.ts`** — read stock availability and levels (`availableFor`, `listLevels`) to display shelf status.
- **`src/modules/inventory/controllers/get-inventory-levels.ts`** — calls level-query functions (`listLevels`, `availableFor`, `listMovements`, `listPreorders`, `lowStockCount`) to serve API responses.
- **`scripts/ops/sweep-reservations.ts`** — invokes `runReservationSweep` for periodic cleanup of stale reservations.
- **Cart & delivery test suites** — import individual functions or `inventoryService` to set up and assert stock state in integration scenarios (checkout totals, stock flags, preorders, holds, merge, override-sync).
- **`src/modules/delivery/tests/factories.ts`** — builds inventory fixtures (levels, holds) used across delivery integration tests.

## Notes

- The file is a **barrel only**; no logic lives here. All behavior is in the sub-modules.
- The doc comment warns that the named-export surface is load-bearing: `module.ts` and `metrics.ts` import `openLevel`, `removeLevel`, `receive`, `lowStockCount` by name, and test suites drive the rest. Do not remove or rename exports when refactoring sub-files.
- `isStockBoundToOrder` and `isHoldReleased` are available via `inventoryService` but are **not** re-exported as top-level named exports — callers must use the object handle for those two.
- The folder grew past ~800 lines and was split into sub-files; this index is the stable facade. See `docs/theory/layers.md` for the split rationale.
