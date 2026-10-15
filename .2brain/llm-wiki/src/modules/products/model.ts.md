---
source: src/modules/products/model.ts
sha256: a329be59bf0241e4bb4ebc12478d3918b06301a60357551cd255024cacfb8867
generated_at: 2026-10-15T11:42:26.343386+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/model.ts

## Purpose

Defines the Mongoose schema, Zod validation schemas, and TypeScript interfaces for the `products` collection. It is the single source of truth for what a product document looks like (both as a plain record and as a Mongoose document), what the API accepts on create/replace/update, and how stock fields are declared but left to `@modules/inventory` to write. Derived fields (`available`, `inStock`, `lowStock`, `preorder`) are intentionally excluded from storage and computed at serialization time.

## Key elements

- **`ProductRecord`** — Plain-object shape of stored fields (no Mongoose `Document`). Excludes `available`, `inStock`, `lowStock`, `preorder`, `currency`, and `id` (uses `_id` instead). Dates are real `Date` objects.
- **`ProductSnapshot`** — `ProductRecord` minus `onHand`, `reserved`, `active`, `purchasable`. The frozen shape an order line embeds; the two stock counters and purchasability flags describe live warehouse state, not the historical purchase.
- **`ProductDocument`** — `ProductRecord` + Mongoose `Document` + `id` string getter + `pendingImageKey` (image-digest bookkeeping, deliberately absent from `ProductSnapshot`).
- **`ProductModel`** — `Model<ProductDocument>` type; business logic lives in `./service`, queries in `./repository`.
- **`checkProductTranslationFields`** — Validates one locale's translation fields against the contract's Zod schema and returns `TranslationFieldIssue[]` (field + message). Used by the kernel's `translatables` registry.
- **`zodProductCreateSchema` / `zodProductReplaceSchema` / `zodProductUpdateSchema`** — Zod superRefine schemas wrapping the generated API body schemas (`CreateProductBody`, `ReplaceProductByIdBody`, `UpdateProductByIdBody`) with three business refinements: fallback-locale must not be deleted (and must be present for create/PUT), release date ≤ 1 year ahead, price decimal places ≤ shop currency's minor unit.
- **`productSchema`** — Mongoose `Schema` declaring `title`, `price` (via `moneyPath`), `taxClass`, `rateType`, `sku`, `onHand`/`reserved` (defaults 0, min 0, **read-only from this module's perspective**), `description`, `imageUrl`, `thumbnailUrl`, `translations`, `releaseDate`, soft-delete (`deletedAt`), and a sparse unique index on `sku`.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — Provides `moneyPath` (used for the `price` schema field) and `moneyPlugin` (applied to the schema for serialization).
- **`src/infrastructure/persistence/revision-plugin.ts`** — `revisionPlugin` is registered on `productSchema` for audit/revision tracking.
- **`src/infrastructure/persistence/serialize.ts`** — `applySerialization` is used in the schema's serialization pipeline to compute derived fields (e.g. `available`) at read time.
- **`src/infrastructure/i18n/index.ts`** — Exports `t` (used in refinement error messages) and `getFallbackLocale` (used by `refineFallbackLocale`).
- **`src/kernel/registry.ts`** — Source of the `TranslationFieldIssue` type consumed by `checkProductTranslationFields`.
- **`src/modules/orders/model.ts`** — Embeds its own Mongoose schema that mirrors `ProductSnapshot` (not `productSchema` itself), so `onHand`/`reserved` are structurally unreachable in an order line.
- **`src/modules/orders/services/snapshot.ts`** — Produces `ProductSnapshot` objects from a live product at order-placement time.
- **`src/modules/cart/services/*.ts`** (`preorder`, `reorder`, `shelf`, `view`) — Read product fields (price, `taxClass`, `rateType`, `releaseDate`) to compute cart-level pricing and availability.

## Notes

- **`onHand` / `reserved` are declared here but never written by this module.** All stock mutations go through `@modules/inventory`, which owns the state transitions and ledger. This file only declares the columns because it owns the collection.
- **`available` is never persisted.** It is computed from `onHand - reserved` at serialization time (`applyProductTransform` / `derivedStockFields`), so no writer can let it drift.
- **`ProductSnapshot` vs `ProductRecord`:** When building order fixtures or serializing order lines, use `ProductSnapshot` — it structurally excludes the two mutable stock counters and the `active`/`purchasable` flags (which would always be `true` for a purchasable product at the time of sale).
- **`taxClass` and `rateType` absence means "shop default."** The `./tax` resolver (`resolveTaxRate`) never returns "no rate"; absence narrows to the shop's standard configuration.
- **`sku` uniqueness is enforced by a sparse unique index (`products_sku`), not by the schema definition.** The schema only declares the field shape.
- **`imageUrl` has no default.** A product without an image simply lacks the field; `imageUrl: null` on update explicitly unsets it.
- **`pendingImageKey`** exists only on `ProductDocument` (not `ProductRecord` or `ProductSnapshot`), so it never appears in order snapshots or API responses.
