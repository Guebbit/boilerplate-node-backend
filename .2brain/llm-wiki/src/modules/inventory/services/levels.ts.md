---
source: src/modules/inventory/services/levels.ts
source_sha256: db3d9b0158893984196da97c9d8a96fcc4b964690b9cb426e0b6be8851d333d1
context_sha256: f35a6fb2eaa166ba8aedea3528850cbe47ebbe6d2bd0517609f73d1a5165bb3f
generated_at: 2026-11-22T05:22:51.319048+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/levels.ts

## Purpose
Holds the level rows (per-product stock counters) of the inventory module and the reads built on them: the stock board, the preorder board, the low-stock gauge, per-product availability for checkout, and the stock-movement ledger. It also holds the two lifecycle writes that create and erase a level row in response to product events.

## Key elements
- `openLevel(productId)`: inserts a zero-stock level row if absent (`insertIfAbsent`). It is idempotent, so it is safe under at-least-once outbox delivery. It books no units; units enter only through `receive`. Marked `@internal`; it is the `product.created` listener's job.
- `removeLevel(productId)`: deletes the level row via `deleteByProductId`. It is meant only for hard deletes; soft deletes and restores must leave the counters alone. Marked `@internal`; it is the `product.deleted` listener's job.
- `availableFor(productIds, preorderIds, backorderIds)`: returns a `Map<string, StockPosition>` of what can be sold, as `{ available, shelf }`.
  - Preorder products: `available` is `roomOn(level)`, the room left under the allowance.
  - Backorder products: `available` is the shelf count plus `roomOn(level)`.
  - Other products: `available` is the shelf count.
  - Products with no level row are absent from the map. Room can be `Infinity`, never `null`.
- `listPreorders(filters)`: a paginated preorder board. It reads `preorderBoard` from the repository, then enriches rows with title and release date from `productService.findManyByIds`. `sellsAgainstCap` is true when the product is a preorder (`isPreorder`) or has `allowBackorder === true`.
- `listLevels(filters)`: a paginated stock board, scarcest first. `lowOnly` adds `maxAvailable: lowStockThreshold()`. Titles come from `productService`, falling back to the product id if the product is not found.
- `getLevel(productId)`: returns one product's level as `ResponseSuccess<InventoryLevel>`, or a 404 `ResponseReject` (`inventory.product-not-found`). The 404 applies both when the product is missing and when it has no level row.
- `lowStockCount()`: counts publicly visible products at or under the low-stock threshold. It takes candidate ids from `lowAvailabilityProductIds`, then calls `productService.countPublic(ids, { excludePreorders: true })`.
- `listMovements(filters)`: a paginated ledger, newest first, with no sort argument. It reports `totalItems`.

## Relationships
- **`src/modules/inventory/repository.ts`**: `stockLevelRepository` (`insertIfAbsent`, `deleteByProductId`, `findManyByProductIds`, `findByProductId`, `preorderBoard`, `stockBoard`, `lowAvailabilityProductIds`) and `stockMovementRepository`, which `listMovements` delegates to.
- **`src/modules/inventory/domain/index.ts`**: `roomOn` computes the room under the backorder or preorder cap.
- **`src/modules/inventory/presenter.ts`**: `presentInventoryLevel` and `presentPreorderLevel` shape the rows returned by the boards and `getLevel`.
- **`src/modules/inventory/config.ts`**: `lowStockThreshold()` supplies the threshold for `listLevels` and `lowStockCount`.
- **`src/modules/inventory/services/types.ts`**: `LevelFilters`, `MovementFilters` and `StockPosition`.
- **`@modules/products`** (not in the neighbor list): `productService` (`findManyByIds`, `findByIdRaw`, `countPublic`) and `isPreorder`.
- **`src/infrastructure/persistence/search.ts`**: `normalizePagination`, `buildPaginatedMeta`, and the `PaginationInput` and `PaginatedMeta` types.
- **`src/infrastructure/http/response.ts`**: `generateSuccess` and `generateReject` in `getLevel`.
- **`src/infrastructure/i18n/index.ts`**: `t` for the 404 message.
- **`src/modules/inventory/module.ts`**: its `PRODUCT_CREATED` and `PRODUCT_DELETED` listeners call `openLevel` and `removeLevel`, per the doc comments.
- **`src/modules/inventory/services/index.ts`**: not imported by this file, but the comments refer to `inventoryService`, which the two listener-only functions are kept off.

## Notes
- The level is the only source of stock; the product holds no count. The catalogue, not this module, decides which ids are preorders or backorders, and callers pass them in.
- Boards are paged inside the database on `stocklevels` alone. Product titles are composed afterwards through `productService` (API composition) instead of a cross-module join.
- A level row missing its product still appears on the stock board, with the product id as its title, so a counter holding units is never hidden.
- Preorders are excluded from `lowStockCount`, since they wait for stock that does not exist yet.
- The doc comments also mention `receive`, `adjust` and `PATCH` as other ways the level is used; their implementations are not in this file.
