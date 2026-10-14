---
source: src/modules/inventory/services/index.ts
sha256: de290259309e1b97f3285315d1b42bbf6ed63ac24d5b8b6b625b8e7888edff8c
generated_at: 2026-10-14T15:58:10.074252+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/index.ts

## Purpose

Barrel file (and sole public surface) for the inventory services module. It re-exports every stock-mutation and stock-query function from the sub-files (`reserve`, `holds`, `returns`, `sweep`, `levels`, `admin`) and bundles them into a single `inventoryService` object. All stock changes funnel through `applyTransition` internally; this file is purely the import/export boundary so callers never reach into sub-paths directly.

## Key elements

- **Named re-exports** — Every function is published by name *and* through the `inventoryService` object. `module.ts` and `metrics.ts` import `openLevel`, `removeLevel`, `receive`, and `lowStockCount` directly; the remaining callers (cart services, tests, controllers) may use either form.
- **`inventoryService`** — Single object handle exposing all 24 operations (reserve, commit, ship, release, restock, sweep, level CRUD, admin adjustments, movement/preorder queries, cache refresh, hold checks).
- **Type re-exports** — `StockLine`, `StockShortfall`, `ReserveOutcome`, `LevelFilters`, `MovementFilters` from `./types`.
- **Sub-file imports (not re-exported as objects):** `./reserve`, `./holds`, `./returns`, `./sweep`, `./levels`, `./admin`, `./types`.

## Relationships

- **`src/modules/cart/services/checkout.ts`** — Consumes `reserveForOrder`, `commitForOrder`, `releaseForOrder` (and related hold functions) during order placement and finalisation.
- **`src/modules/cart/services/shelf.ts`** — Uses hold-related exports (`extendHoldForOrder`, `isHoldReleased`, `isStockBoundToOrder`) for shelf/hold logic.
- **`src/modules/cart/services/view.ts`** — Reads stock state via `availableFor` and hold-boundary checks.
- **`src/modules/inventory/controllers/get-inventory-levels.ts`** — Calls `listLevels`, `lowStockCount`, `listMovements` to serve admin read endpoints.
- **`scripts/ops/sweep-reservations.ts`** — Ops script that invokes `runReservationSweep` to expire stale reservations.
- **`src/modules/cart/tests/integration/*.test.ts`** and **`src/modules/delivery/tests/integration/*.test.ts`** — Drive the full reservation → commit → ship / release cycles through this barrel.
- **`src/modules/delivery/tests/factories.ts`** — Constructs fixture orders that the above integration tests pass into inventory functions.

## Notes

- **Surface contract:** The barrel's export list is load-bearing. A file move or rename inside the folder must not shrink the public surface, because `module.ts`, `metrics.ts`, and multiple test suites import by name from this index.
- **No transactions:** The module deliberately avoids Mongo multi-document transactions. Gaps (e.g., between counter write and ledger insert) are acknowledged at the call sites that own them, not guarded here.
- **Folder, not single file:** Split into sub-files only after the module passed ~800 lines. `docs/theory/layers.md` documents the layering rationale.
- **`applyTransition` is internal:** It is not exported from this barrel. Consumers only see the high-level operations listed above.
