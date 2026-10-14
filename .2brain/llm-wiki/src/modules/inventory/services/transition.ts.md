---
source: src/modules/inventory/services/transition.ts
sha256: 8ef3b7f6092e1b0c9547395a8e4e016e26c348922f30bf71dc6463f9653cc67d
generated_at: 2026-10-14T16:00:06.217329+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/transition.ts

## Purpose

The single chokepoint through which every stock counter change and its corresponding ledger row pass. It encapsulates the read-ensure-delta-record-sync pipeline so that sibling services (`reserve`, `holds`, `returns`, etc.) never touch the repository or cache directly — they only declare *what* moves, and this file decides *how*.

## Key elements

- **`applyTransition(reason, productId, quantity, context?, session?)`** — The core primitive. Ensures a level row exists, computes the counter delta via `counterDeltaFor`, applies it conditionally, writes a `stockMovement` ledger row, and (outside a transaction) refreshes the product cache. Returns `false` when the movement is refused; `true` when it lands. Marked `@internal` — never exposed via the module barrel.
- **`applyToEveryLine(reason, lines, context, session?)`** — Order-level loop that calls `applyTransition` per line and **throws** on any refusal, giving the caller's transaction a natural rollback point. Special-cases `ship` + `kind: 'preorder'` to reject shipping units that are still a preorder claim.
- **`syncStockCache(productId)`** — Reads the current level row, pushes `{ onHand, reserved }` to the catalogue via `productService.syncStockCache`, then invalidates the `products` cache tag. Swallows all errors (log-and-continue) so a cache hiccup never fails an already-committed transition.

## Relationships

- **`../domain` (`domain/index.ts`)** — Provides `counterDeltaFor` (maps a reason + quantity + kind to signed deltas) and the `HoldKind` type used to decide which counter a `release`/`expire` returns to.
- **`../repository`** — `stockLevelRepository` (find, ensure, applyDelta) and `stockMovementRepository` (create ledger row) are the only data-access points this file uses.
- **`@modules/products` (`products/index.ts`)** — `productService.syncStockCache` keeps the catalogue's denormalised counter copy in step after every non-transactional write.
- **`@infrastructure/adapters/cache`** — `invalidateCacheTagsLogged(['products'])` busts the HTTP response cache for product reads.
- **`@infrastructure/adapters/logger`** — Structured error log when the catalogue sync fails.
- **`@types`** — `StockMovementReason` enum that drives guard logic, delta computation, and the ledger `reason` column.
- **Sibling services (`reserve`, `holds`, `returns`, `allocate`, `admin`, `levels`)** — Callers that delegate to `applyTransition` or `applyToEveryLine`; they own the *policy* (which reasons are allowed, what context to record) and rely on this file for the *mechanics*.
- **`delivery/tests/unit/fulfillment.test.ts`** — Exercises the `ship` / `commit` paths through `applyToEveryLine`.

## Notes

- **No-row semantics differ by reason.** `reserve` / `preorder` against a missing level row return `false` (nothing to hold). `release` / `expire` / `commit` return `true` (nothing to undo — let the sweep continue). `receive` / `adjust` fall through to `ensure`, creating the row on the fly.
- **Transaction awareness.** When a `session` is passed, the catalogue cache sync is deliberately skipped (it lives outside this module and cannot roll back). The caller is expected to invoke `refreshStockCacheForOrder` after commit.
- **`kind` is not persisted on the ledger row.** It only influences which counter a `release`/`expire` gives back (preordered vs. stock); the `recorded` spread excludes it.
- **Stryker mutation-test suppression** wraps the `syncStockCache` catch block — the "never fail the caller" contract is intentional and should not be "fixed" by tests.
