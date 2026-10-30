---
source: src/modules/products/model.ts
sha256: b6d1c8818341068f35f8998e9f05d4ce5b2c2cb4153a7605be7a279c7297cacf
generated_at: 2026-10-29T05:26:52.053083+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/model.ts

## Purpose

Defines the Mongoose schema, TypeScript interfaces, and Zod validation schemas for the `products` collection. It is the single owner of the product data shape: what is stored, what is derived at read-time (e.g. `available`, `preorder`), and what business rules gate every create/replace/update body.

## Key elements

- **`ProductRecord`** – Plain-object shape of stored fields (no Mongoose `Document` machinery). Excludes all derived fields (`available`, `inStock`, `lowStock`, `preorder`, `backorder`, `buyable`, `currency`).
- **`ProductSnapshot`** – `ProductRecord` minus warehouse counters (`onHand`, `reserved`) and volatile flags (`active`, `purchasable`, `allowBackorder`, `restockDate`). This is the shape an order line freezes.
- **`ProductDocument`** – `ProductRecord` + Mongoose `Document`; adds document-only bookkeeping (`pendingImageKey`).
- **`ProductModel`** – Typed `Model<ProductDocument>` alias for services/repository.
- **`productSchema`** – The Mongoose `Schema` instance (field types, enums, `moneyPath`, `revisionPlugin`, `moneyPlugin`, unique sparse `sku` index).
- **`zodProductCreateSchema` / `zodProductReplaceSchema` / `zodProductUpdateSchema`** – `superRefine`-wrapped versions of the OpenAPI-generated Zod bodies, each adding the four shared business refinements.
- **`checkProductTranslationFields`** – Validates one locale's title/description against the contract's `translations` rules; returns `TranslationFieldIssue[]`. Used by the generic i18n translator.
- **`refineProduct` (internal)** – Orchestrates the four refinements: fallback-locale guard, date-within-one-year guard (×2), and price-decimal-places guard.

## Relationships

- **`src/domain-primitives/money.ts`** – Provides `fitsCurrency` and `minorUnitExponent`, used by `refinePricePlaces` to cap decimal places against the shop currency.
- **`src/infrastructure/i18n/*`** – Provides `getFallbackLocale` and `t` for the fallback-locale refinement and all i18n error messages.
- **`src/infrastructure/persistence/money-field.ts`** – `moneyPath` declares the `price` field in the schema; `moneyPlugin` is registered on the schema.
- **`src/infrastructure/persistence/revision-plugin.ts`** – `revisionPlugin` is applied to the schema for audit/revision tracking.
- **`src/infrastructure/persistence/serialize.ts`** – `applySerialization` is registered so that `available` (and other derived fields) are computed at read-time, never persisted.
- **`src/kernel/registry.ts`** – Supplies the `TranslationFieldIssue` type consumed by `checkProductTranslationFields`.
- **`src/modules/orders/model.ts`** – Defines its own embedded Mongoose schema that *mirrors* `ProductSnapshot` (not `productSchema`), so warehouse counters are structurally unreachable on the order side.
- **`src/modules/orders/services/snapshot.ts`** – Produces `ProductSnapshot` objects when an order is placed.
- **`src/modules/orders/tests/factories.ts`** – Builds fixture products conforming to `ProductRecord` / `ProductSnapshot`.
- **`src/modules/cart/services/{preorder,shelf,view}.ts`** – Read product fields (including `preorder`, `onHand`, `reserved`) to compute cart-line availability and stock display.

## Notes

- `available`, `preorder`, `inStock`, `lowStock`, `backorder`, and `buyable` are **never stored**; they are derived at serialization time. A writer that persists them would create drift.
- `onHand` and `reserved` live in this schema (because this module owns the collection) but are **written exclusively by the inventory module**. Product services should never mutate them.
- `backorderLimit` / `backordered` are internal counters copied from inventory; they never appear on the wire.
- `pendingImageKey` exists only on `ProductDocument`, not on `ProductSnapshot`, so it is never embedded in order lines.
- The fallback locale (from `NODE_FALLBACK_LOCALE`) may never be `null`-deleted, and must be *present* on create/PUT (full-replace semantics) but is merely *protected* on PATCH.
- `taxClass` and `rateType` use "absence = shop default" as their sentinel; their `enum` values are taken directly from the `TaxClass` / `RateType` enums in `@types`.
- `CHECKED_LOCALE = 'checked'` is an internal parsing trick: it parks one locale's fields under a throwaway key so the Zod `translations` schema can be applied field-by-field. The string never reaches a user-facing message.
