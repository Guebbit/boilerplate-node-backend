---
source: src/modules/inventory/services/levels.ts
sha256: 9c6c92eb4006082a782fecd696aa3ea3a7ba70e08b075b714290f053ab9426f6
generated_at: 2026-10-14T15:58:36.893396+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/levels.ts

## Purpose

Read-side service over the `stocklevels` and `stockmovements` collections. It exposes the stock board, the preorder board, the low-stock gauge, the available-for-sale lookup, the movement ledger, and the two lifecycle hooks (`openLevel`, `removeLevel`) that the inventory module fires on product create/delete events.

## Key elements

- **`openLevel(productId, onHand)`** — Insert-if-absent a zero level row; books a `receive` movement only when *this* call created the row. Idempotent under at-least-once delivery. Called by `module.ts`'s `PRODUCT_CREATED` listener.
- **`removeLevel(productId)`** — Deletes the level row. Called only by `module.ts`'s `PRODUCT_DELETED` listener for the `hardDelete: true` branch; soft-delete/restore leaves counters intact.
- **`availableFor(productIds, preorderIds?)`** — Returns a `Map<productId, units>` read from the ledger (not the cache). Preorder ids resolve to `preorderLimit − preordered` instead of `available`.
- **`listPreorders(filters)`** — Paged preorder board (most outstanding first). Composes product `title`/`releaseDate` from `productService` after paging.
- **`listLevels(filters)`** — Paged stock board sorted by scarcity. Accepts `lowOnly` to filter by `lowStockThreshold()`. Falls back to the raw product id if the product lookup misses.
- **`lowStockCount()`** — Returns the count of *publicly visible* products at or below the threshold, excluding preorders. Scraped by `metrics.ts`.
- **`listMovements(filters)`** — Paged ledger (newest first) via `stockMovementRepository.search`. Relies on `DEFAULT_SORT` for stable pagination.

## Relationships

- **`src/modules/inventory/module.ts`** — Registers `openLevel` on `PRODUCT_CREATED` and `removeLevel` on `PRODUCT_DELETED`.
- **`src/modules/inventory/repository.ts`** — Provides `stockLevelRepository` and `stockMovementRepository` used for all reads and the insert/delete.
- **`src/modules/inventory/services/transition.ts`** — `openLevel` calls `applyTransition` (to book the opening movement) and `syncStockCache`.
- **`src/modules/inventory/services/types.ts`** — Source of `LevelFilters` and `MovementFilters` parameter types.
- **`src/modules/inventory/config.ts`** — Supplies `lowStockThreshold()` used by `listLevels` and `lowStockCount`.
- **`src/modules/inventory/metrics.ts`** — Calls `lowStockCount()` to feed the low-stock gauge.
- **`src/modules/products/index.ts` / `src/modules/products/services/index.ts`** — `productService.findManyByIds` and `productService.countPublic` are called after paging to hydrate titles and to filter publicly visible products.
- **`src/infrastructure/persistence/search.ts`** — Provides `normalizePagination`, `buildPaginatedMeta`, and `PaginationInput` used by every paged query.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the insert-then-book sequence in `openLevel`.
- **`src/types/index.ts`** — Source of `StockMovementReason`, `InventoryLevel`, `PreorderLevel`, `StockMovement`.
- **Integration tests** (`opening-stock.test.ts`, `preorder.test.ts`, `service.test.ts`) — Exercise `openLevel`, the preorder/level boards, and the movement ledger end-to-end.

## Notes

- **Idempotency in `openLevel`:** the row is always created at zero; the movement is booked only when `inserted` is `true` *and* `onHand > 0`. A redelivery finds the existing row and does nothing.
- **`availableFor` deliberately bypasses the cache:** a stale zero in the cache would permanently block a sale that the shelf actually covers, with no self-healing path.
- **No cross-module DB join:** product titles are fetched via `productService` *after* the page is settled from `stocklevels`. A product that the lookup cannot find falls back to its own id rather than dropping the row, so a stray level row holding units is still visible to an admin.
- **`listMovements` omits an explicit sort argument:** it depends on `search`'s `DEFAULT_SORT`, which is the only ordering that makes paged ledger reads stable.
- **Preorder exclusion in `lowStockCount`:** preorders wait for stock that does not yet exist; they are not "running low" and are filtered out via `excludePreorders`.
