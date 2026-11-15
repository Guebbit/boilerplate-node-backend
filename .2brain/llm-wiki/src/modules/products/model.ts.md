---
source: src/modules/products/model.ts
sha256: 41824fd1b7dd785284e3a0e1a3c9be04d40fa6b104df98c70a5098a6114e0f0b
generated_at: 2026-11-14T21:24:11.368547+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/model.ts

## Purpose

Defines the Mongoose schema, document/model types, and Zod validation schemas for the product collection. It owns the shape of stored product data (including the `onHand`/`reserved` stock counters and preorder fields) and enforces business-level refinements (fallback-locale presence, date horizon, price precision) that the OpenAPI-generated Zod schemas cannot express. Derived fields (`available`, `preorder`, `inStock`, `lowStock`, `buyable`) are computed at serialization time and never persisted.

## Key elements

- **`ProductRecord`** — Plain-data interface (no Mongoose `Document`) describing a stored product row. Omits all derived/API-only fields. Includes `_id`, optional `releaseDate`, `restockDate`, `backorderLimit`, `backordered`, `stockVersion`, and timestamps.
- **`ProductSnapshot`** — Subset of `ProductRecord` minus stock counters, backorder fields, `active`/`purchasable`, `allowBackorder`, and `restockDate`. The shape an order line freezes; used by `orders/model.ts`.
- **`ProductDocument`** — `ProductRecord` + Mongoose `Document`; adds `id`, `pendingImageKey`.
- **`ProductModel`** — `Model<ProductDocument, …>` type for the registered Mongoose model.
- **`productTranslationFieldRules`** — Extracted from the generated `UpdateProductByIdBody` Zod schema; exposes the per-locale field rules to the i18n translatables registry.
- **`zodProductCreateSchema` / `zodProductReplaceSchema` / `zodProductUpdateSchema`** — `superRefine` wrappers over the generated create/PUT/PATCH bodies. All three apply the same four refinements via `refineProduct`; `mustBePresent` is `true` for create and PUT, `false` for PATCH.
- **`refineFallbackLocale`** — Rejects `null` (or absence on create/PUT) for the fallback locale entry in `translations`.
- **`refineDateWithinYear`** — Rejects `releaseDate`/`restockDate` more than one shop-day ahead of `latestReleaseDate(now)`.
- **`refinePricePlaces`** — Rejects a price whose decimal places exceed the shop currency's minor-unit exponent.
- **`productSchema`** — Mongoose `Schema<ProductDocument>`: declares `title`, `price` (via `moneyPath`), `taxClass`, `rateType`, `sku`, `onHand`, `reserved`, `backorderLimit`, `backordered`, `stockVersion`, `releaseDate`, `restockDate`, translations, and timestamps. Registers `revisionPlugin`, `moneyPlugin`, and `applySerialization`.

## Relationships

- **`src/domain-primitives/money.ts`** — Imports `fitsCurrency` and `minorUnitExponent` for the price-precision refinement.
- **`src/infrastructure/i18n/`** (`catalog.ts`, `context.ts`, `index.ts`) — Imports `getFallbackLocale` and `t` for i18n-aware validation messages and fallback-locale resolution.
- **`src/infrastructure/persistence/money-field.ts`** — Imports `moneyPath` (price field definition) and `moneyPlugin` (schema plugin).
- **`src/infrastructure/persistence/revision-plugin.ts`** — Imports `revisionPlugin` for schema revision tracking.
- **`src/infrastructure/persistence/serialize.ts`** — Imports `applySerialization` to hook the `available`-derivation transform into Mongoose's serialization pipeline.
- **`src/modules/products/domain/preorder.ts`** — Imports `latestReleaseDate` to bound `releaseDate`/`restockDate` refinements.
- **`src/modules/orders/model.ts`** — Embeds a Mongoose sub-schema mirroring `ProductSnapshot` (intentionally *not* `productSchema`) so stock counters are unreachable on order lines.
- **`src/modules/orders/services/snapshot.ts` / `place.ts`** — Consume `ProductSnapshot` to freeze product state at order time.
- **`src/modules/cart/services/preorder.ts` / `shelf.ts` / `view.ts`** — Read `ProductRecord`/`ProductDocument` for stock and preorder availability.
- **`src/modules/orders/tests/factories.ts`** — Builds fixture objects conforming to `ProductRecord` / `ProductSnapshot`.

## Notes

- `onHand` and `reserved` are **declared** here (this module owns the collection) but **written only** by the `@modules/inventory` module. Never update them from product services.
- `available` is **never stored**; it is derived from `onHand` and `reserved` at serialization time via `applyProductTransform`. Any writer that sets it would be silently overwritten.
- `taxClass` and `rateType` use "absent means shop default" semantics: `taxClass` absent → standard rate; `rateType` absent → `zero`. Both `enum` values match the OpenAPI `TaxClass`/`RateType` contracts exactly.
- `sku` uniqueness is enforced by a **sparse unique index** (`products_sku`), not by the schema definition. Concurrent writes are safe only because of that index.
- `ProductSnapshot` is intentionally narrower than `ProductRecord`: it strips everything warehouse-state or availability-related so a frozen order line never carries stale stock numbers.
- The `pendingImageKey` field exists **only** on `ProductDocument` (not on `ProductRecord` or `ProductSnapshot`) to keep the image-digest bookkeeping out of embedded order copies.
