# src/modules/products/model.ts

## Purpose

Declares the Mongoose schema, Zod validation schema, and serialization transform for the Product collection. It owns the column declarations (including `onHand`/`reserved`) and the single-point derivation of `available`, while delegating all business logic to `./service` and queries to `./repository`.

## Key elements

- **`ProductSnapshot`** — Plain interface of stored product fields (no Mongoose `Document`). Used by `orders` to embed a product copy on line items without pulling in document machinery. Omits `available` (derived) and uses `_id`.
- **`ProductDocument`** — Extends `ProductSnapshot` with Mongoose `Document` plus `pendingImageKey` (internal image-pipeline bookkeeping, deliberately excluded from `ProductSnapshot` so it never appears in order snapshots).
- **`zodProductSchema`** — Zod validation built on the generated `CreateProductBody`; overrides `title` and `price` with i18n error messages. Uses lazy `t()` thunks so messages resolve after i18next init.
- **`productSchema`** — Mongoose `Schema` defining all columns (`title`, `price`, `onHand`, `reserved`, `description`, `imageUrl`, `thumbnailUrl`, `pendingImageKey`, `categories`, `tags`, `active`, `deletedAt`) plus two named indexes: `products_createdAt` and `products_active_deletedAt`.
- **`applyProductTransform`** — Exported serialization function combining the shared `_id`→`id` / `__v` strip with `applyProductAvailability` (computes `available = max(0, onHand − reserved)`). Reused by `./service` for lean/aggregate results that bypass Mongoose's `toJSON`.
- **`productModel`** — The registered Mongoose model instance (`'Product'`).

## Relationships

- **`@infrastructure/i18n`** — Imports `t` to supply localized error messages in `zodProductSchema`.
- **`@infrastructure/persistence/serialize`** — Imports `applySerialization` to build `applyProductTransform` on top of the shared base transform.
- **`src/modules/orders/model.ts`** — Imports `ProductSnapshot` for embedding on order line items (not `ProductDocument`, to avoid document-only fields like `pendingImageKey`).
- **`src/modules/products/service.ts`** — Consumes `productModel` and calls `applyProductTransform` on lean/aggregate query results.
- **`src/modules/products/repository.ts`** — Runs queries against `productModel`; the `products_active_deletedAt` index supports its `publicScope` filter.
- **`src/modules/products/fixtures.ts` / `demo.ts`** — Provide test and seed data shaped to this schema.
- **`src/modules/products/index.ts`** — Re-exports the public surface of this module.
- **`scripts/backfill-image-thumbnails.ts`** — Writes `thumbnailUrl` / clears `pendingImageKey` on existing products.
- **`src/modules/cart/services/view.ts` / `reorder.ts`** — Read product data (including derived `available`) when rendering or reordering cart items.

## Notes

- **`available` is never persisted.** It is computed at serialization time by `applyProductAvailability`, clamped to ≥ 0. No writer can let it drift.
- **`onHand` / `reserved` are declared here but written only by `@modules/inventory`.** This module owns the collection (hence the columns) but performs no stock mutations.
- **Zod `.extend()` replaces a field entirely.** Any override must restate every constraint (e.g. `.min(0)`) or the constraint is silently dropped. A prior `.refine()` override lost the price minimum.
- **`t()` calls must be thunks** (`() => t(...)`) inside Zod `{ error }` options so they execute at parse time, after i18next has initialized.
- **Index names are explicit** to surface name/key mismatches at startup rather than silently creating a duplicate or no-op index.
- **`pendingImageKey` lives on `ProductDocument` only**, keeping it out of `ProductSnapshot` so it never leaks into order line-item embeddings.
