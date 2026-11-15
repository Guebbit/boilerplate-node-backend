---
source: src/modules/products/repository.ts
sha256: 292958af71fa5671aebb921aa8386b58892f3c0b29a24a5e458de80ca23b5fe1
generated_at: 2026-11-14T21:26:03.530707+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/repository.ts

## Purpose

Defines the product data-access layer. Extends the generic `createRepository` factory with catalogue-specific concerns: authorization scoping (public vs. admin), a sitemap-oriented pagination query, a single-aggregation facet count, and the stock-counter mirror that `@modules/inventory` writes through. Exists as a single exported object so the products services and module wiring have one entry point for all product reads and the two write-side mirrors.

## Key elements

- **`PUBLIC_SCOPE`** (const) — `{ active: true, deletedAt: null }`; the filter fragment that restricts a read to published, non-soft-deleted products. Spread into any Mongo filter.
- **`ListedProduct`** (interface) — `{ id, updatedAt? }`; the minimal shape returned by `listedPage` for sitemaps.
- **`StockCounters`** (interface) — `{ onHand, reserved, backorderLimit?, backordered?, version }`; the stock fields inventory copies onto a product document.
- **`productRepository`** (exported const) — the repository object. Combines:
  - **Base CRUD** (from `createRepository`) — standard find/create/update operations supplied by the factory.
  - **`publicScope()`** — returns a fresh copy of `PUBLIC_SCOPE`.
  - **`findByIdScoped(id, scope?)`** — single-product read with an optional authorization filter applied in the same query.
  - **`findByIdRawScoped(id, scope)`** — same, but returns a `Lean` (untransformed) document; used when embedding a snapshot (e.g. order line).
  - **`findPublicById(id)`** — `findByIdScoped` bound to `PUBLIC_SCOPE`.
  - **`listedPage(skip, limit)`** — paginated public catalogue returning only `{ id, updatedAt }`, ordered by `_id`.
  - **`facets()`** — single `$facet` aggregation producing category and tag counts over the public catalogue.
  - **`syncStockCache(productId, counters, session?)`** — writes `StockCounters` onto the product doc, guarded by a `stockVersion` comparison to prevent lost updates; returns the pre-write document.
  - **`translatable`** — column metadata for the i18n translation pipeline.
  - **`writebackImage`** — conditional image-digest writeback for the products collection.
- **`searchable` config** (passed to factory) — maps search parameters (`category`, `tag`, `title`, `active`, `purchasable`, `deleted`, `priceMin/Max`, sort keys) to Mongo query fields.

## Relationships

- **`src/modules/products/model.ts`** — provides `productModel` (the Mongoose model), `applyProductTransform` (document → `Product` mapping), and the `ProductDocument` type used throughout this file.
- **`src/infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory, `toObjectId` validator, `Lean` and `Repository` types; supplies the base CRUD methods spread into `productRepository`.
- **`src/infrastructure/persistence/translatable-columns.ts`** — `translatableColumnsOf(productModel)` produces the `translatable` metadata object.
- **`src/infrastructure/persistence/image-writeback.ts`** — `imageWritebackFor(productModel)` produces the `writebackImage` method.
- **`src/infrastructure/adapters/image.worker.ts`** — supplies the `ImageWriteback` type annotation for `writebackImage`.
- **`src/modules/products/services/read.ts`** — consumes `productRepository` for read operations.
- **`src/modules/products/services/search.ts`** — consumes `productRepository` for search operations.
- **`src/modules/products/services/crud.ts`** — consumes `productRepository` for create/update operations.
- **`src/modules/products/services/lookups.ts`** — consumes `productRepository` for lookup operations.
- **`src/modules/products/services/remove.ts`** — consumes `productRepository` for removal operations.
- **`src/modules/products/module.ts`** — wires `productRepository` into the products module's dependency graph.
- **`src/modules/products/tests/contract/api.contract.test.ts`** — exercises the repository's public surface for contract verification.
- **`src/modules/cart/tests/integration/checkout-stock-divergence.test.ts`** and **`src/modules/cart/tests/integration/product-removal-protects-orders.test.ts`** — integration tests that exercise `syncStockCache` and scoped reads under concurrent cart/inventory conditions.

## Notes

- The exported type is written out explicitly (not inferred) because Mongoose's generic chain is too large for TypeScript to serialize at an export boundary (TS7056). The same constraint is why `Repository` is a separate exported type in `create-repository.ts`.
- `PUBLIC_SCOPE` uses `deletedAt: null`, which in Mongo matches both an explicit `null` and a missing field. This is the single spelling used across all public-scope queries; do not introduce a `deletedAt: { $exists: false }` variant.
- `syncStockCache` guards against lost updates via `stockVersion: { $not: { $gte: counters.version } }` in the filter. A stale snapshot silently no-ops and returns the pre-write doc; it never overwrites a newer value.
- Both `syncStockCache` and `writebackImage` pass `timestamps: false` — these are system writes (inventory mirror, image pipeline) and must not advance the product's `updatedAt`, which admin-edit timestamps and the `listedPage` sitemap rely on.
- `facets()` uses a single `$facet` stage (not two separate `$group` pipelines) so both category and tag counts are computed against the same document snapshot, avoiding a discrepancy if a product is written between two round-trips.
- `listedPage` sorts by `_id` rather than `createdAt` for stable pagination as the catalogue grows at the tail.
