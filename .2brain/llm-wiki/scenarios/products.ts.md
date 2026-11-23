---
source: scenarios/products.ts
source_sha256: b1dc39679cd97a805b8c89cbbf15dd6841af7db3a775feea47373a50bb59d247
context_sha256: 4c79417ee3b6ce3c6f7968ebe7df77527aa932f8ec687a902afdc85443c93bcc
generated_at: 2026-11-22T01:44:54.754564+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/products.ts

## Purpose
The catalogue's slice of the demo dataset. It defines product fixtures (named edge-case rows plus combinatorial filler) and the copy (English/Italian titles and descriptions) for each. `scenarios/apply.ts` seeds these rows into a live database, and `tests/integration/scenarios/shop.test.ts` seeds them into a throwaway one and checks API responses against the generated response schema. Fields a record omits fall back to the `default:` in `@modules/products/model`, via `@modules/products/factories`.

## Key elements
- `fillerProductId` (re-export from `./products-filler`): lets `./wishlist` and `scenarios/flows/shop-history.ts` address a specific filler row without importing `./products-filler` directly.
- `ProductCopy` (internal interface): per-locale copy. `en` is required (the fallback locale, and the source of the product document's derived index column). `it` is optional.
- `NAMED_PRODUCT_COPY`: a `Record` keyed by `SEED_PRODUCT_IDS` key. It holds the en/it `title`/`description` for each named product, so the English text is written once. The keys are `dogFoodStandard`, `heaterSoftDeleted`, `scratchPostOutOfStock`, `dogBedPremium`, `bundleInactive`, `barebones`, `puppyCourseDigital`, `bedOffSale`, `bowlLowStock`, `bowlNoWithdrawal` and `catTreeHeavy`. `barebones` has a title only, with no description.
- `namedProducts`: the array of `makeProduct({...})` records. Each takes its id from `SEED_PRODUCT_IDS`, its copy from `NAMED_PRODUCT_COPY[...].en`, and its images from `productImages.<key>`, the default import of a generated images JSON (produced by `npm run scenario:images`). Each covers one branch the storefront and repositories exercise:
  - `dogFoodStandard`: a standard product.
  - `heaterSoftDeleted`: carries `deletedAt`, the soft-delete branch.
  - `scratchPostOutOfStock`: never receives opening stock, so it stays at zero.
  - `dogBedPremium`: a premium product.
  - `bundleInactive` (further records are not visible in the excerpt): the inactive twin of soft-deleted.
- `seedProductsCollection` (referenced in the module doc): writes the product rows plus a `translations` row per locale. Its body is not visible in the excerpt.
- Imports from `@kernel/translation` (`planTranslations`, `writeTranslations`, `isTranslationPlan`, `isTranslationAvailable`, `TranslationBatch`) and `insertIfAbsent`/`SeedOutcome` from `@scenarios/seed` support that seeding.

## Relationships
- `./products-filler`: supplies `FILLER_PRODUCTS`, `FILLER_IMAGE_ROLE_KEYS` and `fillerProductId`. Filler rows cycle a fixed image pool, so a larger grid needs no new downloads.
- `./product-ids`: `SEED_PRODUCT_IDS` provides the stable ids and the keys for the named rows.
- `@modules/products/factories`: `makeProduct` builds each record.
- `@modules/products/repository`: `productRepository` is imported for seeding.
- `@scenarios/seed`: `insertIfAbsent` and `SeedOutcome`.
- `@kernel/translation`: plans and writes the per-locale translation rows.
- `@infrastructure/i18n` (`catalog.ts`, `index.ts`): `getFallbackLocale` is imported from the index.
- `@types`: `ProductTranslationFields`.
- `scenarios/flows/shop-history.ts`: gives most products their opening stock via opening receipts, and addresses filler rows through the `fillerProductId` re-export.
- `src/modules/cart/tests/unit/merge-rule.test.ts`: a related file in the graph. The excerpt shows no direct interaction.

## Notes
- Every title and description is stored twice: flat on the product document, as the derived index column that `text`/`title=` search and the stock board's sort read, and as a `translations` row per locale.
- No named row carries stock. Stock comes only from opening receipts in `scenarios/flows/shop-history.ts`, so every unit has a movement behind it. `scratchPostOutOfStock` is the row that never gets one (see `OPENING_STOCK`).
- Soft-deleted (`deletedAt`) and inactive are deliberately separate, single-record states. `publicScope()` requires active and not deleted, so they look the same from outside.
- `categories` is non-empty on every rich record, because an empty facet endpoint on a fresh install reads as broken. `barebones` is the deliberate exception.
- A product with English copy only is a legitimate state, and the seeder writes exactly what it finds. `en` is the one locale `planTranslations` will not let a row be deleted in.
- Images come only from the generated JSON (`npm run scenario:images`), never hand-placed.
