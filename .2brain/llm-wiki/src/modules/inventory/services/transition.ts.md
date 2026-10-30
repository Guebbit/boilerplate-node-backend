---
source: src/modules/inventory/services/transition.ts
sha256: 42b509ba9e59498bba43137492308c527808be387040791f6a6cc679be721d3e
generated_at: 2026-10-29T04:05:19.406773+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/transition.ts

## Purpose

The single chokepoint through which every stock counter movement and its corresponding ledger row pass. Named transitions (receive, adjust, hold, release, expire, commit, ship, backorder) all delegate here, making it the one place that knows how to compute deltas, apply them conditionally, write the movement record, and keep the catalogue's stock cache in step.

## Key elements

- **`applyTransition(reason, productId, quantity, context?, session?)`** — Core writer. Reads (or `insertIfAbsent`) the stock-level row, computes the delta via `counterDeltaFor`, applies it conditionally, writes a `stockMovement` row on success, and (when no session is given) refreshes the product cache. Returns `false` if the counters refuse the move. Marked `@internal`; other services in the module call it through the barrel.
- **`refreshStockCache(productId)`** — Reads the product's current level, pushes `onHand / reserved / backorderLimit / backordered` into the products catalogue via `productService.syncStockCache`, then invalidates the `products` cache tag. Never rejects: on failure it logs and resolves, because the underlying transition has already committed.
- **`refreshStockCacheForProducts(productIds)`** — Deduplicates the ID list and calls `refreshStockCache` sequentially. Intended for callers that hold a transaction and must sync the cache only after commit.
- **`applyToEveryLine(reason, lines, context, session?)`** — Loops over an order's lines calling `applyTransition`; throws an `Error` on the first refusal so the caller's transaction rolls back all lines. Includes a guard that prevents shipping units still marked as a backorder claim.

## Relationships

- **`src/modules/inventory/domain/index.ts`** — Imports `counterDeltaFor` (computes which counters shift and by how much) and the `HoldKind` type.
- **`src/modules/inventory/repository.ts`** — Uses `stockLevelRepository` (find, insertIfAbsent, applyDelta) and `stockMovementRepository` (create) for all persistence.
- **`src/modules/products/index.ts`** — Calls `productService.syncStockCache` to keep the catalogue's denormalised stock copy consistent.
- **`src/infrastructure/adapters/cache.ts`** — Calls `invalidateCacheTagsLogged(['products'])` after a successful sync.
- **`src/infrastructure/adapters/logger.ts`** — Logs an error if the cache refresh fails.
- **`src/modules/inventory/services/index.ts`** — Barrel through which sibling services (`allocate`, `holds`, `reserve`, `returns`, `top-up`, `admin`) reach `applyTransition`; the function is documented as never leaving the barrel.
- **`src/modules/inventory/module.ts`** — Referenced in comments: its `PRODUCT_DELETED` listener deletes the stock-level row, which is why `applyTransition` treats a missing row on release/expire/commit as "nothing to move" rather than a failure.

## Notes

- **Session vs. no-session cache rule.** When a `ClientSession` is passed, `applyTransition` skips the cache refresh entirely; the caller is responsible for calling `refreshStockCacheForProducts` after the transaction commits, because the catalogue write crosses a module boundary and cannot be rolled back.
- **`kind` and `uncapped` are not persisted.** They influence *which* counter a release/expire returns or whether the backorder cap is bypassed, but they are stripped before the movement row is written (`recorded` spread excludes them).
- **Missing-row semantics are reason-dependent.** `reserve`/`backorder` → `false` (nothing to claim); `release`/`expire`/`commit` → `true` (nothing to return, but the caller's sweep must continue); `receive`/`adjust` → row is inserted first, then the normal path runs.
- **`refreshStockCache` swallows all errors.** This is intentional: the ledger is the source of truth, and a subsequent transition on the same product will correct the cache. A failure here must not block the caller's post-commit obligations (returning a hold, issuing a refund).
