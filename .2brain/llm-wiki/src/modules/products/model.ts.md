---
source: src/modules/products/model.ts
sha256: ec8f879813b4d0fe60e915b6f9a2f311a24d1ffe8a3c56ce799e37dcd3126efe
generated_at: 2026-09-27T15:32:26.880900+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/model.ts

## Purpose

Defines the Mongoose schema and document types for the `products` collection, the Zod validation schemas for the create/replace/update API operations, and the `ProductRecord` / `ProductSnapshot` type split that separates "what the shop stores" from "what an order line remembers." It owns the collection's shape but delegates stock mutations to `@modules/inventory` and derives `available` at serialization time so it can never drift.

## Key elements

- **`ProductRecord`** — Plain-object shape of a stored product (Mongoose fields with real `Date`s, `_id` as `ObjectId`). Excludes `available` (derived) and `currency` (from config).
- **`ProductSnapshot`** — `ProductRecord` minus `onHand` / `reserved`. The "customer-facing" view embedded in order line items; the warehouse counters never travel with an order.
- **`ProductDocument`** — `ProductRecord` ∩ Mongoose `Document`; adds the string `id` getter and `pendingImageKey` (image-digest pipeline bookkeeping, never on `ProductSnapshot`).
- **`ProductModel`** — `Model<ProductDocument, …>` type alias used by the repository and services.
- **`zodProductCreateSchema` / `zodProductReplaceSchema` / `zodProductUpdateSchema`** — Built on the OpenAPI-generated Zod bodies; override `price` and `translations` with i18n-aware messages, then `superRefine` the fallback-locale invariant (never `null`; must be present on create).
- **`refineFallbackLocale`** — Shared helper that rejects a `null` fallback-locale entry (all ops) and, when `mustBePresent` is true, also rejects its absence (create only).
- **`DEFAULT_PRODUCT_IMAGE_URL`** — Exported constant (env-overridable) used as the schema default and as the reset target for `imageUrl: null` in the service.
- **`productSchema`** — The Mongoose `Schema` declaring every stored field, its types, defaults, and `min`/`enum` constraints (e.g., `taxClass` enum, `onHand`/`reserved` ≥ 0, `sku` sparse unique via index).

## Relationships

- **`@infrastructure/i18n` (`index.ts`, `catalog.ts`, `context.ts`)** — Imports `t` and `getFallbackLocale`; all Zod error messages are i18n thunks resolved at parse time, and the fallback-locale guard reads the runtime locale.
- **`@infrastructure/persistence/serialize.ts`** — Imports `applySerialization`, the pipeline that calls `availableStock` to compute `available` at read time.
- **`./domain/stock.ts`** — Imports `availableStock`, the pure function that derives `available` from `onHand` − `reserved`.
- **`./config.ts`** — Imports `productCurrency` (the shop's standard currency, applied at serialization rather than stored per product).
- **`src/modules/orders/model.ts`** — Embeds a Mongoose schema mirroring `ProductSnapshot` (deliberately *not* `productSchema`) so `onHand`/`reserved` are unreachable in an order document; `OrderDocumentItem.product` is typed by `ProductSnapshot`.
- **`src/modules/orders/services/snapshot.ts` / `place.ts`** — Produce/consume the `ProductSnapshot` shape when a product is embedded into an order.
- **`src/modules/products/repository.ts`** — Consumes `ProductModel` for all queries against the collection.
- **`src/modules/products/factories.ts`** — Constructs `ProductRecord` / `ProductDocument` fixtures that satisfy the shapes defined here.
- **`src/modules/products/index.ts`** — Barrel-exports the public names from this file.

## Notes

- **`.extend()` replaces, not merges.** A Zod `.extend({ price: … })` that omits `.min(0)` silently drops the contract's `minimum: 0`. All three schemas restate `.min(0)` explicitly; a prior bare `.refine()` override caused a regression where a negative price passed.
- **i18n messages must be thunks.** `t('…')` is called lazily inside `error: () => t(…)` so it runs after `i18next.init()`; an eager call would capture an uninitialized translator.
- **`onHand` / `reserved` are read-only here.** This module declares the columns (it owns the collection) but never writes them. All stock transitions go through `@modules/inventory`; writing them here would bypass the ledger.
- **`available` is a phantom field.** It appears in the `Product` API type and in serialized output but has no column. Any code that tries to `product.available = …` is setting a property on the JS object, not persisting anything.
- **`pendingImageKey` is document-scoped.** It exists on `ProductDocument` but is intentionally absent from `ProductSnapshot` and `ProductRecord`, so an order's embedded copy can never carry a stale quarantine key.
- **`DEFAULT_PRODUCT_IMAGE_URL` is a single source of truth.** Both the schema default and the service's `imageUrl: null` reset resolve to the same exported constant to prevent drift.
