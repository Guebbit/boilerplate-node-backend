---
source: src/modules/inventory/services/index.ts
sha256: 9d493c745190d7af923819f5c5788c6fe1d90ece06706c1bd9769e1f6fd7bd86
generated_at: 2026-11-08T06:02:31.700240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/index.ts

## Purpose

Barrel (facade) file for the inventory services module. It re-exports every public service function and shared type from the per-flow sub-modules and bundles them into a single `inventoryService` object, giving consumers one import target instead of reaching into individual files. The module doc comment states the core invariant: all stock changes flow through `applyTransition`, pairing a counter move with a ledger row, and that one file exists per flow (not one monolith).

## Key elements

- **`inventoryService`** (const object) — the single exported handle. Bundles:
  - *Reserve / commit / ship / release* — `reserveForOrder`, `reserveMoreForOrder`, `commitForOrder`, `retakeReleasedForOrder`, `shipForOrder`, `shipLinesForOrder`, `releaseLinesForOrder`, `releaseTopUpForOrder`, `releaseForOrder`, `releaseCommittedForOrder`
  - *Cache & query* — `refreshStockCacheForOrder`, `refreshStockCacheForProducts`, `availableFor`, `getLevel`, `listLevels`, `listPreorders`, `lowStockCount`, `listMovements`
  - *Admin / ops* — `receive`, `adjust`, `setBackorderLimit`, `restockReturnedLines`, `extendHoldForOrder`, `runReservationSweep`, `isStockBoundToOrder`, `isHoldReleased`
- **Type re-exports** — `RetakeOutcome` (from `./holds`) and `StockLine`, `TopUp`, `StockShortfall`, `ReserveOutcome`, `StockPosition`, `LevelFilters`, `MovementFilters` (from `./types`).
- **Sub-module sources** — `./reserve`, `./holds`, `./top-up`, `./returns`, `./transition`, `./sweep`, `./levels`, `./admin`.

## Relationships

- **`src/modules/cart/services/checkout.ts`** — consumer; checkout orchestration calls into `inventoryService` for reservation, commit, and release flows.
- **`src/modules/cart/services/shelf.ts`** and **`src/modules/cart/services/view.ts`** — consumers; read stock availability / levels via `inventoryService`.
- **Cart integration tests** (`backorder.test.ts`, `checkout-expected-total.test.ts`, `merge.test.ts`, `preorder.test.ts`, `stock-flag.test.ts`, `stock.test.ts`) — exercise `inventoryService` end-to-end through cart scenarios.
- **`src/modules/delivery/tests/factories.ts`** — test factory that seeds or manipulates inventory state through `inventoryService`.
- **Delivery integration tests** (`backorder.test.ts`, `lost-parcel.test.ts`, `override-sync.test.ts`, `preorder-board.test.ts`, `preorder.test.ts`) — exercise inventory release/ship/alloc paths as part of delivery flows.

## Notes

- **Transaction boundaries are intentional and limited.** Only three call sites wrap work in a real transaction: hold claim + commit (`holds.ts`), delivery + preorder allocation (`admin.ts`), and hold release + announcement (`sweep.ts`). Every other write is a conditional single-document write; gaps are documented at the owning call site rather than in this file.
- **Do not add new stock-mutating code here.** This file is re-exports only. New flows belong in their own sub-module and are then wired into `inventoryService`.
- **Design references** — `docs/theory/layers.md` (one-file-per-flow layering) and `docs/modules/inventory.md` (transaction/gap policy).
