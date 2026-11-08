---
source: src/modules/inventory/services/levels.ts
sha256: 01aae45627297b32ae56c64f182e2cb16d2fe0d2f14db8589cd0580a0090ed5e
generated_at: 2026-11-08T06:02:49.568930+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/levels.ts

## Purpose

Read-side and lifecycle functions for stock level rows: the stock board, the preorder board, the low-stock gauge, the sellable-quantity lookup for checkout, and the movement ledger. It sits between the repositories (raw counters) and the HTTP layer (presented, paginated responses), and also exposes two `@internal` helpers that `module.ts`'s event listeners call to create or erase a level row.

## Key elements

- **`openLevel(productId)`** – Insert-if-absent a zero-stock level row. Called by the `PRODUCT_CREATED` listener in `module.ts`; idempotent under at-least-once delivery.
- **`removeLevel(productId)`** – Delete the level row. Called only by the `PRODUCT_DELETED` listener when `hardDelete: true`; soft-delete/restore must leave counters intact.
- **`availableFor(productIds, preorderIds?, backorderIds?)`** – Returns a `Map<productId, StockPosition>` of what is sellable right now, read from the ledger (not cache). Preorder products sell against `roomOn` (backorder allowance); backorder products sell against shelf + room; plain products sell against shelf alone.
- **`listPreorders(filters?)`** – Paginated preorder board (most outstanding first). Fetches product metadata via `productService` after the page is settled; uses `presentPreorderLevel` and `sellsAgainstCap` logic.
- **`listLevels(filters?)`** – Paginated stock board, scarcest-first. Supports `lowOnly` filter (delegates to `lowStockThreshold()`). Falls back to the product id as title if the product lookup misses.
- **`getLevel(productId)`** – Single-level lookup returning `ResponseSuccess<InventoryLevel>` or a 404 `ResponseReject`. Validates the product exists first.
- **`lowStockCount()`** – Count of publicly visible, non-preorder products at or under the low-stock threshold. Consumed by `metrics.ts`.
- **`listMovements(filters?)`** – Paginated ledger (newest first). Relies on `search`'s `DEFAULT_SORT` for stable ordering.

## Relationships

- **`../repository.ts`** – All data access goes through `stockLevelRepository` and `stockMovementRepository`; this file performs no direct queries.
- **`../presenter.ts`** – `presentInventoryLevel` and `presentPreorderLevel` shape raw rows into the API response types.
- **`../domain/index.ts`** – `roomOn` computes the remaining backorder allowance from a level row.
- **`../config.ts`** – `lowStockThreshold()` supplies the "low stock" boundary used by `listLevels` and `lowStockCount`.
- **`../module.ts`** – Owns the `PRODUCT_CREATED` / `PRODUCT_DELETED` event listeners that call `openLevel` / `removeLevel`.
- **`@infrastructure/http/response.ts`** – `generateSuccess` / `generateReject` wrap `getLevel`'s return.
- **`@infrastructure/i18n`** – `t` localises the 404 message in `getLevel`.
- **`@infrastructure/persistence/search.ts`** – `normalizePagination`, `buildPaginatedMeta`, and `PaginationInput` drive all paged endpoints; `listMovements` delegates sorting to this module's default.
- **`@modules/products`** – `productService` provides titles, release dates, backorder flags, and `countPublic`; `isPreorder` gates the `sellsAgainstCap` flag.
- **`./types.ts`** – `LevelFilters`, `MovementFilters`, and `StockPosition` are the shared input/output contracts for this file.
- **`./index.ts`** – Barrel re-export so consumers import from the services entry point.
- **`tests/integration/top-up.test.ts`** and **`tests/factories.ts`** – Integration coverage for level reads and movement writes.
- **`../cart/tests/integration/stock.test.ts`** – Exercises `availableFor` as the checkout pre-flight path.

## Notes

- `openLevel` and `removeLevel` are deliberately **not** on the inventory service facade; they are listener-only helpers marked `@internal`.
- The "API composition" pattern is intentional: product titles are fetched **after** the page is settled from `stocklevels`, never via a cross-module DB join. A missing product falls back to the raw id rather than dropping the row.
- `availableFor` reads the live ledger, not the catalogue's cached copy, so a missed sync can never cause a spurious refusal that no stock movement would heal.
- `listMovements` passes **no** sort argument; stability depends on `search`'s `DEFAULT_SORT` being the canonical newest-first order.
- `lowStockCount` explicitly excludes preorders (`excludePreorders: true`) because a preorder is waiting for units that do not yet exist—it is not "running low."
