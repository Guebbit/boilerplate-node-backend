---
source: src/modules/inventory/services/transition.ts
sha256: aa21103072098d606f06ea12f085974c525fddefc93c11093ceaab94f98e2223
generated_at: 2026-11-08T06:04:09.636895+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/transition.ts

## Purpose

The single chokepoint through which every stock counter change and its ledger row pass. It encapsulates the read-modify-write of a product's counters, the audit-row insert, and the (optional) catalogue cache sync, so that higher-level services (`reserve`, `hold`, `release`, `return`, `top-up`, `admin`, `allocate`) never touch the repositories directly.

## Key elements

- **`applyTransition(reason, productId, quantity, context?, session?)` → `Promise<boolean>`** — The core primitive. Ensures a level row exists (`insertIfAbsent`), computes the signed delta via `counterDeltaFor`, applies it conditionally, writes a `stockMovement` audit row, and (outside a session) refreshes the catalogue cache. Returns `false` when the counters refused the movement. Marked `@internal`; never exported outside the services barrel.
- **`applyToEveryLine(reason, lines, context, session?)`** — Loop wrapper that calls `applyTransition` per line. Throws on the first refusal so the caller's transaction rolls back all lines (all-or-nothing). Also guards against shipping units that are still a preorder claim.
- **`refreshStockCache(productId)`** — Reads the current level, pushes `{onHand, reserved, backorderLimit, backordered}` into the products catalogue via `productService.syncStockCache`, then invalidates the `products` cache tag. Never rejects; failures are logged and swallowed.
- **`refreshStockCacheForProducts(productIds)`** — Deduplicates IDs and calls `refreshStockCache` sequentially. Intended as the post-commit step a caller owes after a transactional batch.

## Relationships

- **`../domain` (`domain/index.ts` / `domain/transitions.ts`)** — Provides `counterDeltaFor` (reason + quantity → signed per-counter deltas) and the `HoldKind` union.
- **`../repository`** — `stockLevelRepository` (find, `insertIfAbsent`, `applyDelta`) and `stockMovementRepository` (`create`) are the only persistence calls in this file.
- **`../module.ts`** — Its `PRODUCT_DELETED` listener deletes the level row; the "no row" branches in `applyTransition` exist to handle the aftermath (a `release`/`expire`/`commit` against a deleted product still returns `true` so sweeps can proceed).
- **`@modules/products`** — `productService.syncStockCache` keeps the catalogue's denormalised counters in step; called only when no `session` is active.
- **`@infrastructure/adapters/cache`** — `invalidateCacheTagsLogged(['products'])` clears response-cache tags after a successful sync.
- **`@infrastructure/adapters/logger`** — Used solely in `refreshStockCache`'s `.catch` to log non-fatal sync failures.
- **Sister services (`reserve.ts`, `holds.ts`, `returns.ts`, `top-up.ts`, `admin.ts`, `allocate.ts`)** — All import `applyTransition` or `applyToEveryLine` from the barrel; they decide *what* may move, this file decides *how* it moves.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Exercises the shipping path through `applyToEveryLine` with `kind: 'backorder'`.

## Notes

- **Session vs. non-session split:** When a `ClientSession` is supplied the cache sync is *skipped* (it writes outside this module and cannot roll back). The caller is responsible for calling `refreshStockCacheForProducts` after `session.commitTransaction()`.
- **`kind` is not persisted** on the movement row; it only steers which counter a `release`/`expire` restores (e.g. `backordered` for a preorder claim).
- **No-row semantics differ by reason:** `reserve`/`backorder`/`owed` → refuse (`false`); `release`/`expire`/`commit` → succeed trivially (`true`) so order sweeps can continue past a deleted product; `receive`/`adjust` → insert the row first (in practice both check product existence upstream).
- **`refreshStockCache` never rejects.** By design, a failed cache sync must not prevent the caller from completing its remaining duties (returning a hold, issuing a refund). The next transition on that product corrects the cache.
- Stryker mutation-testing is disabled around the `.catch` logger in `refreshStockCache` to prevent the mutation-killing noise from a deliberately swallowed error.
