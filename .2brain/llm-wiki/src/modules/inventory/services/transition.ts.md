---
source: src/modules/inventory/services/transition.ts
sha256: 31663b1d35ca684410bd2d0ae0d95bc2896905e0917fbf72ea5aa3de0cc9f0bd
generated_at: 2026-11-14T20:07:38.190478+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/transition.ts

## Purpose

The single chokepoint through which every stock-counter mutation and its corresponding ledger row pass. It encapsulates the read-guard-apply-record-sync pipeline so that higher-level services (reserve, allocate, returns, top-up, admin) never touch the repositories directly for a counter move.

## Key elements

- **`applyTransition`** (`@internal`) — Core write path. Ensures a level row exists (`insertIfAbsent` on `stockLevelRepository` for first-time products), computes the counter delta via `counterDeltaFor`, applies it conditionally through `stockLevelRepository.applyDelta`, records a movement row via `stockMovementRepository.create`, and (when no transaction session is active) syncs the catalogue cache. Returns `true`/`false` to signal whether the counters actually moved.
- **`applyToEveryLine`** — Iterates over an order's lines, calling `applyTransition` for each. Throws on the first refusal so the caller's transaction rolls back atomically. Special-cases `ship` on a `backorder` kind to reject pre-shipping an unclaimed preorder allowance.
- **`refreshStockCache`** — Reads the current level row, pushes `onHand`/`reserved`/`backorderLimit`/`backordered`/`version` into the products module via `productService.syncStockCache`, then invalidates the `products` cache tag. Swallows all errors (logs and resolves) so a cache failure never blocks the caller's remaining work.
- **`refreshStockCacheForProducts`** — Deduplicates a list of product IDs and calls `refreshStockCache` sequentially. Intended to be called by a service after its transaction commits, since cross-module cache writes cannot participate in the caller's session.

## Relationships

- **`src/modules/inventory/repository.ts`** — Reads/writes via `stockLevelRepository` (`findByProductId`, `insertIfAbsent`, `applyDelta`) and `stockMovementRepository` (`create`). All data access for this file goes through these two repositories.
- **`src/modules/inventory/domain/index.ts`** (re-exporting `transitions.ts`) — Provides `counterDeltaFor` (maps a reason + quantity + hold-kind to signed counter deltas) and the `HoldKind` type.
- **`src/modules/products/index.ts`** — This file imports `productService` from `@modules/products` and calls its `syncStockCache` method to keep the catalogue's cached counter copy consistent.
- **`src/infrastructure/adapters/cache.ts`** — Calls `invalidateCacheTagsLogged(['products'])` after a successful sync.
- **`src/infrastructure/adapters/logger.ts`** — Logs the non-fatal error when the catalogue cache refresh fails.
- **`src/modules/inventory/module.ts`** — Its `PRODUCT_DELETED` listener removes a product's level row; this file's "no row" guard treats that as a legitimate state (see Notes).

## Notes

- **Transaction vs. non-transaction split.** When a `ClientSession` is passed to `applyTransition`, the catalogue cache sync is deliberately skipped (it is a cross-module write that cannot roll back). The caller is responsible for invoking `refreshStockCacheForProducts` after commit.
- **"No row" is not an error.** For `reserve`, `backorder`, and `owed` the absence of a row means "nothing available" → returns `false`. For `release`, `expire`, and `commit` it means "nothing to give back" → returns `true` (trivially moved) so an order sweep can continue past a since-deleted line. `receive` and `adjust` insert the row first.
- **`kind` is not persisted.** The `context.kind` field only steers which counter a `release`/`expire` credits (backordered vs. reserved); it is stripped before the ledger row is written.
- **`applyTransition` is `@internal`.** It never leaves the barrel (`services/index.ts`); external callers go through the named transition services (reserve, allocate, returns, etc.).
