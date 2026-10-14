---
source: scenarios/products.ts
sha256: 99bbd367f516cf6b09adc6ee1b8c57408ae2e0798872aa43685a36aed0b569b8
generated_at: 2026-10-14T07:00:08.309614+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products.ts

## Purpose

Defines the catalogue's named seed rows (11 products) and their per-locale copy, then delegates to `./products-filler` for 128 combinatorial filler rows so the dataset reads like a real pet-supply shop. Consumed by `scenarios/apply.ts` (live dev DB) and `tests/integration/scenarios/shop.test.ts` (throwaway DB).

## Key elements

- **`NAMED_PRODUCT_COPY`** — `Record<keyof SEED_PRODUCT_IDS, ProductCopy>`; the single source for each named product's `title`/`description` in `en` (required) and `it` (optional). Both the product document's derived index column and the translation batch read from here, so the English string is never duplicated by hand.
- **`makeUnstockedProduct(overrides)`** — thin wrapper over `makeProduct` that pins `onHand: 0`. Stock is never seeded directly; it arrives via opening receipts in `shop-history.ts`.
- **`namedProducts`** — array of the 11 product documents (one per `SEED_PRODUCT_IDS` key), each carrying branch-coverage traits: soft-deleted, out-of-stock, inactive, minimal (`barebones`), digital-only, low-stock, no-withdrawal, heavy-item, off-sale.
- **`seedProductsCollection`** (referenced in the module docblock) — the export that writes both the product rows and their `translations` batch into the target database.
- **`fillerProductId`** — re-exported from `./products-filler` so `wishlist` and `shop-history.ts` can reference filler rows without importing the filler module directly.

## Relationships

- **`scenarios/subjects.ts`** — supplies `SEED_PRODUCT_IDS`, the canonical string keys every named product is addressed by.
- **`scenarios/products-filler.ts`** — supplies `FILLER_PRODUCTS`, `FILLER_IMAGE_ROLE_KEYS`, and `fillerProductId`; this file re-exports `fillerProductId` for downstream consumers.
- **`scenarios/seed.ts`** — provides `insertIfAbsent` (idempotent upsert) and the `SeedOutcome` type used to track what was inserted vs. skipped.
- **`scenarios/flows/shop-history.ts`** — issues the opening receipts that give stock to every named product *except* `scratchPostOutOfStock`; also imports `fillerProductId` through this file for variety.
- **`src/modules/products/factories.ts`** — provides `makeProduct` and `ProductOverrides`; the factory's `default:` fields are the fallback for any column a seed row omits.
- **`src/modules/products/repository.ts`** — `productRepository` is used to perform the actual inserts during seeding.
- **`src/kernel/translation.ts`** — provides `planTranslations`, `writeTranslations`, `isTranslationAvailable`, `isTranslationPlan`, and `TranslationBatch`; this file builds the translation batch from `NAMED_PRODUCT_COPY`.
- **`src/infrastructure/i18n/index.ts`** — provides `getFallbackLocale` (resolves to `en`), which the seeder uses to identify the required locale.
- **`src/types/index.ts`** — provides the `ProductTranslationFields` shape used by `ProductCopy`.
- **`src/modules/cart/tests/unit/merge-rule.test.ts`** — integration-level test that exercises catalogue state produced by these seeds (e.g. the off-sale and no-withdrawal rows).

## Notes

- Every row seeds at `onHand: 0`. If a product needs stock, it must go through `shop-history.ts`'s opening-receipt flow — seeding `onHand` directly bypasses the movement audit trail.
- `scratchPostOutOfStock` is the one named product that **never** receives an opening receipt, so it stays at zero stock permanently.
- `barebones` is the only named product with an empty `categories` array; this is deliberate to exercise the "no facets" branch.
- `en` is the only required locale; a product shipped English-only is a valid state. `it` is optional per product.
- All images come from `products-images.generated.json` (`npm run scenario:images`). Filler rows cycle through a fixed pool of 20 images via `FILLER_IMAGE_ROLE_KEYS` — no new downloads regardless of catalogue size.
- `title`/`description` appear twice per product: once as the document's derived search/sort column, once inside the `translations` sub-document. Both are sourced from `NAMED_PRODUCT_COPY` to avoid drift.
