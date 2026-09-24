---
source: scenarios/products.ts
sha256: 0b76a41d9b3591f01c67b3c49a8b43966c039ef73b45d206117c38301833767c
generated_at: 2026-09-23T17:19:17.715798+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products.ts

## Purpose

Defines the full product catalogue for the demo/seed dataset: six hand-written "named" products that cover the branch scenarios the storefront and repositories exercise (soft-deleted, out-of-stock, inactive, minimal), plus 126 combinatorially-generated filler rows that make the catalogue resemble a real pet-supply shop. A `seedProductsCollection` function (truncated) writes these rows and their per-locale translations into a target database.

## Key elements

- **`NAMED_PRODUCT_COPY`** – Record keyed by `SEED_PRODUCT_IDS` holding `{ en, it? }` title/description for each of the six named products. Single source for both the product document's derived index column and the translation batch.
- **`makeUnstockedProduct(overrides)`** – Thin wrapper over `makeProduct` that forces `onHand: 0`. Stated once here rather than repeated on every row; stock is never seeded directly (see Notes).
- **`namedProducts`** – The six products: `dogFoodStandard` (rich baseline), `heaterSoftDeleted` (`deletedAt` set), `scratchPostOutOfStock` (zero stock, no receipt), `dogBedPremium` (rich), `bundleInactive` (`active: false`), `barebones` (title + price only).
- **`fillerProductRows`** – Maps `FILLER_PRODUCTS` through `makeUnstockedProduct`, assigning ids via `fillerProductId(index)` and cycling images through the 20-image pool (`FILLER_IMAGE_ROLE_KEYS`). The `translations` field is stripped from the spread (not a product-schema path).
- **`productFixtures`** – Exported: `[...namedProducts, ...fillerProductRows]`, the complete product list for seeding.
- **`fillerProductId`** – Re-exported from `./products-filler` so other scenario files (`wishlist`, `shop-history`) can reference filler rows without importing the filler module directly.
- **`OPENING_STOCK`** (truncated) – Map of product-id → unit count consumed by `shop-history.ts` to create the opening inventory receipt. Deliberately omits `scratchPostOutOfStock`.

## Relationships

- **`scenarios/products-filler.ts`** – Provides `FILLER_PRODUCTS`, `fillerProductId`, `FILLER_IMAGE_ROLE_KEYS`; supplies the 126 generated rows and the image-cycling key.
- **`scenarios/subjects.ts`** – Exports `SEED_PRODUCT_IDS`, the stable identifiers for the six named products.
- **`scenarios/seed.ts`** – Exports `insertIfAbsent` / `SeedOutcome` used by `seedProductsCollection` to upsert rows idempotently.
- **`scenarios/flows/shop-history.ts`** – Reads `OPENING_STOCK` from this file to `POST /inventory/receipts` before the first checkout, so every unit on the shelf has a movement row.
- **`src/modules/products/factories.ts`** – Provides `makeProduct` and `ProductOverrides`; all rows here are built through it (or the `makeUnstockedProduct` wrapper).
- **`src/modules/products/repository.ts`** – `productRepository` is used by the seed function to write/verify product rows.
- **`src/infrastructure/i18n/index.ts`** – `getFallbackLocale` determines the required locale for translation plans.
- **`src/kernel/translation.ts`** – `isTranslationPlan`, `planTranslations`, `writeTranslations` drive the per-locale translation batch.
- **`src/types/index.ts`** – `ProductTranslationFields` and `UpsertTranslationsRequest` shape the translation payload.
- **`scenarios/index.ts`** – Likely re-exports or orchestrates the product seed as part of the full scenario pipeline.

## Notes

- **Stock is never seeded directly.** Every row ships with `onHand: 0`; actual inventory arrives via the opening-receipt flow in `shop-history.ts`. This guarantees every unit is backed by a movement record.
- **`scratchPostOutOfStock` has no entry in `OPENING_STOCK`.** It stays at zero after all flows run, which is the state the storefront's out-of-stock badge and checkout refusal depend on.
- **`barebones` is intentionally minimal** (no description, categories, tags, or image). It exercises code paths that must tolerate absent optional fields.
- **`deletedAt` and `active: false` are independent.** Both are invisible to external callers via `publicScope()`, but the dataset keeps them on separate rows so tests can distinguish the two states.
- **Images are never hand-placed.** Named-product images come from `products-images.generated.json`; filler rows cycle through a fixed pool of 20.
- **`en` is mandatory, `it` is optional** in `ProductCopy`. A product with only an English translation is a valid catalogue state; the seeder writes exactly what is present.
