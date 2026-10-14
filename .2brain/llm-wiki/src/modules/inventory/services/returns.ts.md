---
source: src/modules/inventory/services/returns.ts
sha256: 1681e523c679a606742eb1e142d47d85d952d0a652b2af3d272131af0cd29a71
generated_at: 2026-10-14T15:59:16.249938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/returns.ts

## Purpose

Handles the inventory side of receiving customer returns: it writes `restock` stock-movement records for the returned lines and provides a post-commit helper to synchronise the catalogue's stock cache. It is intentionally thin — the actual ledger write and cache sync live in `transition.ts` — and relies on the caller to wrap everything in a single Mongoose transaction for atomicity.

## Key elements

- **`restockReturnedLines(lines, context, session?)`** — Creates one `restock` movement per line by delegating to `applyToEveryLine` with `StockMovementReason.restock`. `context.reference` names the originating order; `context.note` names the return. Throws if any line's counters refuse the write, causing the caller's transaction to roll back.
- **`refreshStockCacheForProducts(productIds)`** — Deduplicates the supplied IDs (via `Set`) and calls `syncStockCache` for each product. Intended to be invoked **after** the caller's transaction has committed.

## Relationships

- **`src/modules/inventory/services/transition.ts`** — Source of both `applyToEveryLine` (the shared per-line ledger writer) and `syncStockCache` (the per-product cache synchroniser). This file is the only production import.
- **`src/types/index.ts`** — Provides the `StockMovementReason` enum (specifically the `restock` value used here).
- **`src/modules/inventory/services/index.ts`** — Barrel re-export; consumers typically import the two functions through this index rather than the file directly.
- **`src/modules/inventory/tests/integration/cache-invalidation.test.ts`** — Integration coverage for the cache-sync path (`refreshStockCacheForProducts`).
- **`src/modules/inventory/tests/integration/service.test.ts`** — Integration tests exercising the restock flow end-to-end.

## Notes

- **At-most-once guarantee is external.** This module does not lock or check idempotency itself; the RETURN document's own `approved → received` transition is what prevents double-restocking. The caller must perform that transition and the restock in the **same** transaction.
- **No hold/reservation interaction.** The order's stock hold stays in its `shipped` state; this file never touches it (contrast with `holds.ts`).
- **`session` is optional on `restockReturnedLines`** but should be supplied in production so the ledger write joins the caller's transaction. Passing `undefined` means the write autocommits independently, breaking the atomicity contract described in the docblock.
- **Cache refresh is post-commit only.** `refreshStockCacheForProducts` is a plain `async` loop with no transaction/session parameter; calling it inside the transaction would read uncommitted counters.
