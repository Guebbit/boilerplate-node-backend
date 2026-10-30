---
source: src/modules/inventory/services/levels.ts
sha256: 01aae45627297b32ae56c64f182e2cb16d2fe0d2f14db8589cd0580a0090ed5e
generated_at: 2026-10-29T04:03:55.638898+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/levels.ts

## Purpose

Read-side service over the `stocklevels` and `stockmovements` collections. It exposes the stock board, the preorder board, the low-stock gauge, the per-product availability check used by checkout, the single-level item read, and the paginated ledger. It also owns the level-row lifecycle hooks (`openLevel` / `removeLevel`) that `module.ts` event listeners call on product create/hard-delete.

## Key elements

- **`openLevel(productId)`** — Idempotent `insertIfAbsent` of a zero-stock level row. Called by the `PRODUCT_CREATED` listener; not on the public `inventoryService`.
- **`removeLevel(productId)`** — Deletes a product's level row. Called by the `PRODUCT_DELETED` listener (hard-delete branch only); not on the public `inventoryService`.
- **`availableFor(productIds, preorderIds?, backorderIds?)`** — Resolves sellable quantity per product. Preorder products are sold against `roomOn`; backorder products against shelf + room; everything else against shelf alone. Products with no level row are absent from the returned `Map`.
- **`listPreorders(filters?)`** — Paginated preorder board (allowance > 0 or outstanding units, most outstanding first). Fetches product titles/release dates from `productService` after the page is settled.
- **`listLevels(filters?)`** — Paginated stock board, scarcest-first, sorted inside MongoDB. Supports `lowOnly` filter (threshold from `config`). Falls back to the product id as title if the product lookup misses.
- **`getLevel(productId)`** — Single-product level read. Returns 404 if the product does not exist *or* has no level row.
- **`lowStockCount()`** — Count of publicly visible, non-preorder products at or below the low-stock threshold. Used by `metrics.ts`.
- **`listMovements(filters?)`** — Paginated stock-movement ledger, newest first (relies on `search`'s `DEFAULT_SORT`). Filters by `productId`, `reason`, and shared pagination.

## Relationships

- **`../repository`** (`stockLevelRepository`, `stockMovementRepository`) — all data access for levels and movements.
- **`../domain`** (`roomOn`) — computes remaining preorder allowance from a level row; used in `availableFor`.
- **`../presenter`** (`presentInventoryLevel`, `presentPreorderLevel`) — shapes raw level rows into the public `InventoryLevel` / `PreorderLevel` DTOs.
- **`../config`** (`lowStockThreshold`) — supplies the low-stock cutoff used by `listLevels` and `lowStockCount`.
- **`./types`** (`LevelFilters`, `MovementFilters`, `StockPosition`) — input/output type contracts for this service.
- **`@infrastructure/persistence/search`** (`normalizePagination`, `buildPaginatedMeta`) — shared pagination normalisation and meta construction.
- **`@infrastructure/http/response`** (`generateSuccess`, `generateReject`) — wraps `getLevel` results in the standard response envelope.
- **`@infrastructure/i18n`** (`t`) — localised 404 message in `getLevel`.
- **`@modules/products`** (`productService`, `isPreorder`) — cross-module reads for titles, release dates, public visibility count, and preorder status (API composition, not a DB join).

## Notes

- `openLevel` and `removeLevel` are marked `@internal`; they are deliberately **not** re-exported through `inventoryService`. The `module.ts` event listeners import them directly.
- The "API composition" pattern is intentional: product fields (title, release date) are fetched *after* the level page is settled via a second `productService` call, rather than a cross-collection DB join. This keeps module boundaries clean.
- `listLevels` does not drop a row when the product lookup fails; it substitutes the product id as the title so a stale counter is still visible to an admin.
- `listMovements` omits an explicit sort argument on purpose — `search`'s `DEFAULT_SORT` is the only order that keeps a paged ledger stable.
- `lowStockCount` explicitly excludes preorders (`excludePreorders: true`): a product waiting for stock that does not exist yet is not "running low."
- `availableFor` treats a missing level row as "nothing available" (absent from the map) rather than an error, so checkout can proceed with zero quantity.
