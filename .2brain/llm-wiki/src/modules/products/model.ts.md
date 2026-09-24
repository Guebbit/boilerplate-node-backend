---
source: src/modules/products/model.ts
sha256: 179de118e95d2a71e162477000645e9b98b2c32b4c63080ed66cca22f45e9d67
generated_at: 2026-09-23T19:27:13.569642+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/model.ts

## Purpose

Declares the Mongoose schema, Zod validation schemas, and TypeScript type layer for the Product collection. It is the single source of truth for what fields a product has in the database, how incoming create/update payloads are validated (including i18n-aware error messages and the fallback-locale invariant), and how a stored document is transformed into the public `Product` shape — specifically by deriving `available` from `onHand` and `reserved` at serialization time.

## Key elements

- **`ProductRecord`** – Plain-object interface for stored product fields (Mongoose `_id`, dates as `Date`). Excludes `id` and `available`. Satisfiable by lean reads and fixtures without extending `Document`.
- **`ProductSnapshot`** – `ProductRecord` minus `onHand` / `reserved`. The shape an order line embeds; guarantees warehouse-state counters never leak into order history.
- **`ProductDocument`** – `ProductRecord` + Mongoose `Document`. Adds document-only fields (`id` string getter, `pendingImageKey`).
- **`ProductModel`** – `Model<ProductDocument, …>` type for the registered Mongoose model.
- **`zodProductCreateSchema`** – Zod schema for `POST /products`, extending the generated `CreateProductBody` with i18n error messages, explicit `.min(0)` on price, and the fallback-locale-must-be-present refinement.
- **`zodProductUpdateSchema`** – Zod schema for `PATCH /products/{id}`, extending `UpdateProductByIdBody`; all fields optional, same fallback-locale guard (refuses `null` but not absence).
- **`refineFallbackLocale`** – Shared `superRefine` helper: rejects `null` for the fallback locale (both create and update); additionally rejects `undefined` on create.
- **`productSchema`** – Mongoose `Schema` with all fields, defaults, `enum` on `taxClass`, and two named compound indexes (`products_createdAt`, `products_active_deletedAt`).
- **`applyProductTransform`** – Exported serialization transform (built via `applySerialization`) that strips `__v`, maps `_id`→`id`, and computes `available = availableStock(onHand, reserved)`. Reusable by lean/aggregate paths that bypass `toJSON`.
- **`applyProductAvailability`** – Internal helper invoked by the transform; sets `serialized.available` from the two counters.

## Relationships

- **`src/infrastructure/i18n/index.ts` / `catalog.ts` / `context.ts`** – Imports `t` and `getFallbackLocale` for validation error messages and the fallback-locale invariant. Error-message thunks defer `t()` calls to parse time (after `i18next.init()`).
- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, the generic wrapper that `applyProductTransform` is built on.
- **`src/modules/orders/model.ts`** – Defines a Mongoose sub-schema mirroring `ProductSnapshot` (not reusing `productSchema` itself) so `onHand`/`reserved` are structurally unreachable in an embedded order line.
- **`src/modules/orders/services/snapshot.ts` / `place.ts`** – Produce `ProductSnapshot` objects stored inside order documents.
- **`src/modules/cart/services/checkout.ts` / `view.ts` / `reorder.ts`** – Read `requiresShipping`, `weight`, and other product fields to drive cart and shipping logic.
- **`src/modules/products/repository.ts`** – Issues Mongoose queries against `productSchema`; uses `applyProductTransform` on results.
- **`src/modules/products/index.ts`** – Barrel re-exports the types and schemas defined here.
- **`src/modules/products/factories.ts` / `src/modules/orders/tests/factories.ts`** – Build fixtures conforming to `ProductRecord` / `ProductSnapshot`.

## Notes

- **`available` is never persisted.** It is computed at the single serialization point (`applyProductTransform`) so no code path can let it drift from the two counters.
- **`onHand` / `reserved` are declared here but written exclusively by `@modules/inventory`.** This module owns the collection (hence the column declarations) but performs no stock mutations.
- **Zod `.extend()` replaces, not merges.** Overriding `price` without restating `.min(0)` silently drops the non-negative constraint — the file explicitly re-declares it to guard against a prior regression.
- **`pendingImageKey` is document-only.** It exists on `ProductDocument` and in the Mongoose schema but is _not_ on `ProductSnapshot`, so it never appears in order-embedded copies.
- **Index names are load-bearing.** Mongo matches indexes by name as well as key; renaming an index in code without a corresponding `dropIndex` causes a startup failure rather than a silent no-op.
- **`active` is independent of `deletedAt`.** A soft-deleted product can still be `active: true`; `publicScope()` in the repository requires both `active` and `deletedAt: null`.
