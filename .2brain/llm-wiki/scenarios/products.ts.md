---
source: scenarios/products.ts
sha256: 9e80615fec788a3167934b31212507bbc2decca8d211b93fb9077a410579edf7
generated_at: 2026-11-08T02:31:15.780078+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products.ts

## Purpose

Seeds the product catalogue for demo and integration-test environments. It defines a small set of **named** products that each exercise a specific branch in the storefront/repositories (soft-deleted, out-of-stock, inactive, minimal, digital-only, no-withdrawal, heavy, off-sale, low-stock) and pairs them with combinatorially generated **filler** products so the catalogue reads like a real pet-supply store rather than a list of edge cases. It also writes per-locale translations (`en` required, `it` optional) and ensures every product's `title`/`description` is persisted both as the document's derived index column and as translation rows.

## Key elements

- **`NAMED_PRODUCT_COPY`** – `Record<keyof typeof SEED_PRODUCT_IDS, ProductCopy>`; the single source for each named product's `en`/`it` title and description. Both the flat document fields and the translation batch read from here, so the English string is written once.
- **`ProductCopy`** – interface: `en: ProductTranslationFields` (required) and `it?: ProductTranslationFields` (optional).
- **`makeUnstockedProduct(overrides)`** – thin wrapper around `makeProduct` that pins `onHand: 0`. Every named row passes through it, stating once that stock arrives via opening receipts (see `shop-history.ts`), never via a direct seed.
- **`namedProducts`** – array of `makeUnstockedProduct(...)` calls (one per `SEED_PRODUCT_IDS` entry). Each carries the specific state flag (`deletedAt`, `active: false`, `withdrawable: false`, no `description`, no `categories`, etc.) and spreads the corresponding entry from the generated `products-images.generated.json`.
- **`fillerProductId`** – re-exported from `./products-filler` so `./wishlist` and `scenarios/flows/shop-history.ts` can address a filler row without importing the filler module directly.
- **`seedProductsCollection`** (referenced in file-level docs) – the main seeding routine: calls `insertIfAbsent` via `@scenarios/seed`, plans and writes translation batches through `@kernel/translation` (`planTranslations`, `writeTranslations`, `isTranslationAvailable`, `isTranslationPlan`), and uses `productRepository` for persistence.

## Relationships

- **`scenarios/product-ids.ts`** – provides `SEED_PRODUCT_IDS`; the keys of `NAMED_PRODUCT_COPY` and the `id` field of every named row are drawn from it.
- **`scenarios/products-filler.ts`** – source of `FILLER_PRODUCTS`, `fillerProductId`, and `FILLER_IMAGE_ROLE_KEYS`; this file re-exports `fillerProductId` and relies on the filler's fixed 20-image cycling pool.
- **`scenarios/seed.ts`** – supplies `insertIfAbsent` and the `SeedOutcome` type used by the seeding path.
- **`src/modules/products/factories.ts`** – provides `makeProduct` and `ProductOverrides`, the constructor every row in this file uses.
- **`src/modules/products/repository.ts`** – provides `productRepository`, the persistence layer the seeder calls.
- **`src/infrastructure/i18n/index.ts` / `catalog.ts`** – provides `getFallbackLocale` (the `en` locale) used when planning translations.
- **`src/kernel/translation.ts`** – provides the translation batch utilities (`planTranslations`, `writeTranslations`, `isTranslationAvailable`, `isTranslationPlan`) and the `TranslationBatch` type.
- **`src/types/index.ts`** – provides `ProductTranslationFields`, the shape of each locale's copy.
- **`scenarios/flows/shop-history.ts`** – the *other* side of the seed: it creates the opening receipt that gives named (and filler) products their initial stock. This file deliberately seeds `onHand: 0` so every unit on the shelf has a movement behind it.
- **`src/modules/cart/tests/unit/merge-rule.test.ts`** – consumes the seeded products (via the integration scenario) to exercise cart-merge rules against real catalogue rows.

## Notes

- **Stock is never seeded here.** `makeUnstockedProduct` pins `onHand: 0` on every row. Initial stock arrives exclusively through the opening receipt in `scenarios/flows/shop-history.ts`, so the stock board always shows a movement trail.
- **`barebones` is the deliberate minimal record.** It has no `description` in either locale and no `categories`/`tags`. This is not a bug — it exists to exercise the code path where those fields are absent.
- **`en` is always present, `it` is optional.** A product shipped in English only is a legitimate catalogue state; the seeder writes exactly the locales it finds.
- **Images are generated, not hand-placed.** All come from `./products-images.generated.json` (produced by `npm run scenario:images`). Filler rows cycle through a fixed pool of 20 images (`FILLER_IMAGE_ROLE_KEYS`) so a large grid never triggers extra downloads.
- **Each named product targets exactly one branch.** Soft-deleted (`heaterSoftDeleted`), out-of-stock (`scratchPostOutOfStock`), inactive (`bundleInactive`), off-sale (`bedOffSale`), low-stock (`bowlLowStock`), no-withdrawal (`bowlNoWithdrawal`), heavy (`catTreeHeavy`), digital-only (`puppyCourseDigital`) — they are independent so the dataset can distinguish each state.
- **`scratchPostOutOfStock` is the one row that never receives an opening receipt.** It stays at `onHand: 0` after all flows run, which is what the storefront's out-of-stock badge and checkout refusal depend on.
