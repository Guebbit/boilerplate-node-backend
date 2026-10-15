---
source: src/modules/inventory/services/transition.ts
sha256: 01c8fa26faef9d94afedc4d524b182b07bb2679edad0f81f00d68c06a0258424
generated_at: 2026-10-15T10:36:42.383127+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/transition.ts

## Purpose

The single chokepoint for every stock-counter change in the application. All named transitions (receive, adjust, reserve, hold, release, expire, commit, ship, restock) funnel through `applyTransition`, which atomically updates the counter row, writes the ledger record, and (outside a transaction) refreshes the catalogue's cached copy. It exists so that counter semantics, guard rules, and the audit trail stay in one place rather than scattering across each service.

## Key elements

- **`applyTransition`** *(exported, `@internal`)* — Reads-or-inserts the product's level row, computes deltas via `counterDeltaFor`, performs a conditional write (`applyDelta`), records a `stockMovement` ledger row, then syncs the catalogue cache (skipped when a `ClientSession` is present). Returns `true` only if the counters actually moved. Special-cases a missing row per reason: `reserve`/`preorder` refuse; `release`/`expire`/`commit` report success (trivially, nothing to move); `receive`/`adjust` insert the row first.
- **`applyToEveryLine`** — Iterates an order's lines, calling `applyTransition` per line. Throws on the first refusal so the caller's transaction rolls back. Also pre-rejects `ship` on a `preorder`-kind line (units still claimed, not yet on-hand).
- **`syncStockCache`** — Re-reads the level row, pushes `{onHand, reserved}` to `productService.syncStockCache`, then invalidates the `products` cache tag. Swallows and logs errors; never rejects the caller.
- **`refreshStockCacheForProducts`** — Deduplicates a list of product IDs and calls `syncStockCache` for each. Intended to be called *after* a transaction commits, since the cross-module cache write cannot roll back.

## Relationships

- **`src/modules/inventory/repository.ts`** — Reads/writes via `stockLevelRepository` (findByProductId, insertIfAbsent, applyDelta) and `stockMovementRepository` (create).
- **`src/modules/inventory/domain/index.ts`** — Imports `counterDeltaFor` (maps reason + quantity + kind → signed deltas) and the `HoldKind` type.
- **`src/infrastructure/adapters/cache.ts`** — Calls `invalidateCacheTagsLogged(['products'])` after a successful catalogue sync to bust `GET /products/:id` and list responses.
- **`src/infrastructure/adapters/logger.ts`** — Logs non-fatal cache-sync failures; the transition itself already committed.
- **`src/modules/inventory/services/index.ts`** — Barrel through which sibling services (`reserve.ts`, `holds.ts`, `allocate.ts`, `returns.ts`, `levels.ts`, `admin.ts`) import `applyTransition`; the function is marked `@internal` and is not meant to be reached outside the barrel.
- **`src/modules/inventory/tests/integration/service.test.ts` / `cache-invalidation.test.ts`** — Integration tests exercising transition flows and verifying the `products` cache tag is invalidated.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Exercises the `ship` reason path through `applyToEveryLine`.

## Notes

- `applyTransition` is `@internal`: consume it only via the services barrel, never import the file directly from other modules.
- When a `ClientSession` is passed, the catalogue cache sync is **deliberately skipped**. The caller is responsible for running `refreshStockCacheForProducts` (or an equivalent) after commit, because the cross-module write cannot participate in the transaction.
- A missing level row is not an error: `reserve`/`preorder` refuse (nothing to set aside), while `release`/`expire`/`commit` return `true` so batch sweeps over a deleted product's remaining lines can proceed.
- `context.kind` is **not** persisted on the ledger row; it only influences which counter a `release`/`expire` credits (`preordered` vs `onHand`). The rest of `context` (`reference`, `note`) is spread onto the movement record.
- The `Stryker` disable/restore comments around the `syncStockCache` catch block suppress mutation testing of the error-handling path.
