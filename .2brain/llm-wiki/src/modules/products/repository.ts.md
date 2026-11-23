---
source: src/modules/products/repository.ts
source_sha256: d32fc525e44105cb48445b7d76f13f75ebe7e1a81550aa4fb8acc954bf3691e3
context_sha256: 2f4356088792eee688c79ceda11c1cab1c104109d841a757dec9c531c1d2c3c6
generated_at: 2026-11-22T07:11:52.022112+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/repository.ts

## Purpose
Defines `productRepository`, the product catalogue's data-access object. It builds standard CRUD from the shared repository factory and adds catalogue-specific query rules: a public visibility scope, scoped id lookups, a sitemap page query, category/tag facets, and the image-digest writeback. The exported type is written out explicitly because Mongoose's generics are too large for TypeScript to infer at an export boundary (TS7056).

## Key elements
- **`productRepository`**: `Repository<ProductDocument, Product>` extended with the members below. It is built from `createRepository(productModel, …)` with `applyProductTransform` and a `searchable` config:
  - object-id search on `id`
  - text search on `title` and `description`
  - array regex on `category` and `tag`
  - regex on `title`
  - booleans `active` and `purchasable`
  - a `deleted` presence filter on `deletedAt`
  - a price range (`priceMin`/`priceMax`)
  - sorting by `createdAt`, `price` and `title`
- **`PUBLIC_SCOPE`** (module-private): `{ active: true, deletedAt: null }`. It is what non-admin callers may see, and `null` also matches a missing field.
- **`publicScope()`**: returns a copy of `PUBLIC_SCOPE` for callers outside this file.
- **`findByIdScoped(id, scope?)`**: finds one product by id and applies the scope in the same query. With no scope it is unrestricted (the admin branch). It is `async` because `toObjectId` throws on a malformed id.
- **`findByIdRawScoped(id, scope)`**: the same lookup, returning a lean, untransformed object. It is meant for readers that embed a snapshot, such as an order line.
- **`findPublicById(id)`**: `findByIdScoped` bound to `PUBLIC_SCOPE`.
- **`listedPage(skip, limit)`**: a page of public products as `ListedProduct` (`id`, `updatedAt`). It sorts by `_id` ascending and projects only `updatedAt`, which suits sitemaps.
- **`facets()`**: one `$facet` aggregation over `PUBLIC_SCOPE` products. It returns `{ categories, tags }` as `FacetCount[]`, each sorted by count descending, then name.
- **`translatable`**: `translatableColumnsOf(productModel)`.
- **`writebackImage`**: `imageWritebackFor(productModel)`, the image pipeline's writeback for the `products` collection.
- **`ListedProduct`**: the exported interface for sitemap rows.

## Relationships
- **`model.ts`**: supplies `productModel`, `applyProductTransform` and the `ProductDocument` type.
- **`create-repository.ts`**: supplies `createRepository`, `toObjectId`, and the `Lean` and `Repository` types.
- **`translatable-columns.ts`**: supplies `translatableColumnsOf` and the `TranslatableColumns` type.
- **`image-writeback.ts`**: supplies `imageWritebackFor`.
- **`image.worker.ts`**: supplies the `ImageWriteback` type, which `writebackImage` is typed as.
- The `services/` files (`crud`, `lookups`, `read`, `remove`, `search`), `module.ts`, the tests (`api.contract.test.ts`, `factories.ts`, and the cart's `product-removal-protects-orders.test.ts`) and `scenarios/products.ts` are related neighbours. This file's content does not show how each one uses it.

## Notes
- The id match and the scope are applied in one query. Checking visibility after the read would leak information.
- The `active` search clause is admin-effective: a public scope pins `active: true`, so a contradictory clause returns an empty page rather than listing unlisted products.
- `facets()` uses a single `$facet` so both lists count against the same snapshot. Its `$match` reuses `PUBLIC_SCOPE`, so hidden products never produce facet chips.
- `writebackImage` is conditional on `pendingImageKey` still matching, so stale or duplicate jobs cannot overwrite a later upload. A hard-deleted product shows up as a detectable miss. It uses `timestamps: false`, so the digest finishing does not count as an admin edit.
- `PUBLIC_SCOPE` is a standalone `const` because the repository's own members need it, and reading it back off `productRepository` only works through lazy property resolution.
