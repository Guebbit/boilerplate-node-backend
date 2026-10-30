---
source: scenarios/products.ts
sha256: 8d063f42ee65e8c414951c81fa40bb54440aefd1dfaaca38094aa341021ea4c2
generated_at: 2026-10-29T01:24:42.182309+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products.ts

## Purpose

The catalogue slice of the demo seed dataset. It defines the named (branch-covering) product rows and wires in the combinatorial filler rows so the seeded catalogue resembles a real pet-supply shop. `scenarios/apply.ts` calls this module to seed a live database; `tests/integration/scenarios/shop.test.ts` seeds a throwaway one and validates API responses against the generated schema.

## Key elements

- **`NAMED_PRODUCT_COPY`** – `Record<keyof SEED_PRODUCT_IDS, ProductCopy>` holding `en` (required) and optional `it` title/description for each named product. Single source for both the product document's derived index column and the translation batch.
- **`makeUnstockedProduct(overrides)`** – Thin wrapper around `makeProduct` that pins `onHand: 0`. All stock in the demo arrives via opening receipts (`shop-history.ts`), never directly on the product row.
- **`namedProducts`** – Array of product documents (one per `SEED_PRODUCT_IDS` entry) carrying the specific branch each one exercises: soft-deleted, out-of-stock, inactive, minimal (`barebones` has no description), off-sale, low-stock, no-withdrawal, heavy, etc.
- **`ProductCopy`** (interface) – Shape of per-locale copy: `en: ProductTranslationFields`, `it?: ProductTranslationFields`.
- **`fillerProductId`** – Re-exported from `./products-filler` so downstream consumers (`wishlist`, `shop-history`) address filler rows through this file rather than importing the filler module directly.
- **Translation helpers** – `planTranslations`, `writeTranslations`, `isTranslationAvailable`, `isTranslationPlan` (from `@kernel/translation`) and `getFallbackLocale` (from `@infrastructure/i18n`) are used to build and persist the `translations` collection alongside the product documents.
- **`insertIfAbsent` / `SeedOutcome`** – Imported from `@scenarios/seed` for idempotent insertion.
- **`productImages`** – Static import of `./products-images.generated.json` (generated via `npm run scenario:images`); every product row spreads its image entry from here. No hand-placed image URLs.

## Relationships

- **`scenarios/product-ids.ts`** – Provides `SEED_PRODUCT_IDS`, the canonical key set that drives `NAMED_PRODUCT_COPY` and the `namedProducts` array.
- **`scenarios/products-filler.ts`** – Supplies `FILLER_PRODUCTS`, `FILLER_IMAGE_ROLE_KEYS`, and `fillerProductId`. Filler rows expand the catalogue beyond the named edge-case products.
- **`scenarios/seed.ts`** – Provides `insertIfAbsent` (idempotent upsert) and the `SeedOutcome` type used to report what was inserted vs. already present.
- **`scenarios/flows/shop-history.ts`** – Consumes the products seeded here; its opening-receipt flow is what puts stock on the shelves (this file intentionally seeds all rows at `onHand: 0`).
- **`src/modules/products/factories.ts`** – Provides `makeProduct` and `ProductOverrides`, the schema-aware constructor every product row in this file goes through.
- **`src/modules/products/repository.ts`** – Provides `productRepository`, used to read back or verify seeded rows.
- **`src/kernel/translation.ts`** – Provides the translation planning/writing pipeline (`planTranslations`, `writeTranslations`, etc.) used to persist per-locale copy into the `translations` collection.
- **`src/infrastructure/i18n/index.ts`** – Provides `getFallbackLocale` (the `en` fallback) referenced when building the translation batch.
- **`src/types/index.ts`** – Exports `ProductTranslationFields`, the shape of a single locale's title/description payload.

## Notes

- `en` is the **only required** locale in `ProductCopy`; a product with English-only copy is a valid catalogue state. `planTranslations` will not delete a row in the fallback locale.
- `barebones` intentionally has **no description** in either locale and **no categories**—it exercises the "minimal record" branch. Every other RICH record carries at least one category so a fresh-install facet endpoint doesn't return an empty array.
- The soft-deleted row (`heaterSoftDeleted`) and the inactive row (`bundleInactive`) are **distinct** states; the dataset deliberately keeps both so `isVisibleToCaller` and repository soft-delete filters can be tested independently.
- `scratchPostOutOfStock` stays at `onHand: 0` forever (no opening receipt targets it), unlike the other zero-stock rows which receive stock via `shop-history.ts`.
- Filler images cycle through a fixed pool of 20 (`FILLER_IMAGE_ROLE_KEYS`); growing the grid never adds a new image file.
- The file is a `@module` (no top-level exports beyond the re-exported `fillerProductId`); its public surface is the side effect of seeding when imported by `scenarios/apply.ts`.
