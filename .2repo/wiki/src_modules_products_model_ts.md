# src/modules/products/model.ts

## Purpose

Defines the Product's Mongoose schema, its Zod validation schema, and the serialization transform that derives the computed `available` field from `onHand` and `reserved`. This is the single source of truth for the Product collection's shape, indexes, and the one-time normalization every product response passes through.

## Key elements

- **`ProductSnapshot`** — Interface for stored product fields (dates as `Date`, `_id` as `ObjectId`). Excludes `available` (derived, never stored) and Mongoose document machinery. Intended for embedding in `orders` line items.
- **`ProductDocument`** — Extends `ProductSnapshot` with Mongoose's `Document`. Adds `pendingImageKey`, a document-only field for the image-digest pipeline that must never leak into embedded snapshots.
- **`ProductModel`** — Type alias for the Mongoose `Model`. Business logic lives in `./service`; queries in `./repository`.
- **`zodProductSchema`** — Zod validation built via `.extend()` on the generated `CreateProductBody`. Overrides `title` and `price` with i18n-aware messages (thunk-based, evaluated at parse time). Explicitly restates `.min(0)` on price because `.extend()` replaces a field entirely.
- **`productSchema`** — Mongoose schema declaring all stored fields. Declares `onHand`/`reserved` (written only by `@modules/inventory`) and `active`/`requiresShipping` (read by other modules). Creates two named indexes: `products_createdAt` (listing sort) and `products_active_deletedAt` (storefront filter).
- **`applyProductTransform`** — Wraps `applySerialization` with a custom `after` hook (`applyProductAvailability`) that computes `available = max(0, onHand - reserved)`. Also omits `pendingImageKey` from output. Exported for reuse on lean/aggregate results in `./service`.
- **`productModel`** — The instantiated Mongoose model for the `Product` collection.

## Relationships

- **`@infrastructure/i18n`** (`context.ts`, `index.ts`) — Imports `t()` for i18n error messages inside `zodProductSchema`. Calls are deferred to parse time via thunks so i18next is initialized.
- **`@infrastructure/persistence/serialize.ts`** — Imports `applySerialization` to build `applyProductTransform` (shared `_id→id` rename, `__v` stripping, plus the custom `after` hook).
- **`src/modules/orders/model.ts`** — `ProductSnapshot` is the shape `orders` embeds on line items (not a full document, so it can't satisfy `ProductDocument`).
- **`src/modules/products/repository.ts`** — The `products_active_deletedAt` index backs the repository's `publicScope()` query; `products_createdAt` backs the default listing sort.
- **`src/modules/products/service.ts`** — Calls `applyProductTransform` on lean/aggregate results (e.g., `search()`) where `toJSON` doesn't fire automatically.
- **`src/modules/products/index.ts`** — Barrel re-export of the public API of this file.
- **`src/modules/products/fixtures.ts` / `tests/fixtures.ts` / `demo.ts`** — Consume `productModel` and/or `zodProductSchema` for seeding, testing, and demo data.
- **`src/modules/orders/tests/integration/repository.test.ts` / `orders/fixtures.ts`** — Exercise product data through the orders flow, relying on `ProductSnapshot` shape.

## Notes

- `available` is **never persisted**. It is computed at serialization time by `applyProductAvailability` so no write path can let it drift. The clamp at zero is a safety net, not a contract guarantee.
- `onHand` / `reserved` are declared here (this module owns the collection) but **never written** by this module. All stock transitions go through `@modules/inventory`.
- `pendingImageKey` is deliberately absent from `ProductSnapshot` so it never appears on `orders`-embedded copies. The serialization transform also omits it; with `additionalProperties: false` on the contract, any leak would fail response validation.
- The Zod `.extend()` pitfall: overriding a field **replaces** it entirely. Any custom override must restate all contract constraints it relies on (the `price` override reasserts `.min(0)` for this reason).
- Index names are fixed by name, not just key — renaming or duplicating an index key under a different name causes a startup failure rather than a silent no-op.
- `active` and `deletedAt` are independent axes. A soft-deleted product still has `active: true`; `publicScope` requires both to be in the "visible" state.
