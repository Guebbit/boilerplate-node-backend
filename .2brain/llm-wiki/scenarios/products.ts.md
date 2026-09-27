---
source: scenarios/products.ts
sha256: 9d1314d4b5cf1bbb482b38d50ac07085710ba7a5dc0bf5ba60a35104750bdc12
generated_at: 2026-09-27T13:50:41.490618+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products.ts

## Purpose

Seeds the product catalogue for demo and integration-test scenarios. It defines seven named products that collectively cover the branch paths the storefront and repositories exercise (soft-deleted, out-of-stock, inactive, minimal, digital), then appends 126 combinatorial filler rows so the catalogue resembles a real pet-supply store. It also plans and writes per-locale translations (`en` required, `it` optional) for every named row.

## Key elements

- **`NAMED_PRODUCT_COPY`** — Single source of truth for title/description in both locales; feeds both the flat `title`/`description` index columns and the translation batch.
- **`makeUnstockedProduct(overrides)`** — Thin wrapper around `makeProduct` that pins `onHand: 0`. All product rows pass through it, encoding the invariant that stock arrives exclusively via the opening receipt in `shop-history.ts`, never by direct seeding.
- **`namedProducts`** — Array of seven product documents (dogFoodStandard, heaterSoftDeleted, scratchPostOutOfStock, dogBedPremium, bundleInactive, barebones, puppyCourseDigital). Each targets a specific branch or absence pattern.
- **Filler rows** — Built from `FILLER_PRODUCTS` (126 rows) in `./products-filler`, each assigned an id via `fillerProductId` and an image cycled from a fixed 20-image pool (`FILLER_IMAGE_ROLE_KEYS`).
- **`fillerProductId`** (re-export) — Made available through this module so `./wishlist` and `scenarios/flows/shop-history.ts` can reference a filler row without importing `products-filler` directly.
- **Translation seeding** — Uses `planTranslations` / `writeTranslations` from `@kernel/translation` and `isTranslationAvailable` / `isTranslationPlan` to batch-write locale rows per product.
- **`SEED_PRODUCT_IDS`** (from `./subjects`) — Stable string identifiers keyed per product, used for cross-scenario addressing.

## Relationships

- **`scenarios/flows/shop-history.ts`** — Consumes the seeded products; its opening receipt is what moves `onHand` off zero. Re-exports of `fillerProductId` let it target specific filler rows.
- **`scenarios/products-filler.ts`** — Supplies `FILLER_PRODUCTS`, `fillerProductId`, and `FILLER_IMAGE_ROLE_KEYS`; this file assembles those rows into full product documents.
- **`scenarios/seed.ts`** — Provides `insertIfAbsent` and the `SeedOutcome` type used to track whether a row was actually inserted.
- **`scenarios/shop-modules.ts`** / **`scenarios/subjects.ts`** — `subjects.ts` exports `SEED_PRODUCT_IDS`; `shop-modules.ts` is a sibling scenario file in the same dependency cluster.
- **`src/modules/products/factories.ts`** — Source of `makeProduct` and `ProductOverrides`, the canonical product-document constructor.
- **`src/modules/products/repository.ts`** — `productRepository` is imported (used by the seeding/verification path).
- **`src/infrastructure/i18n/catalog.ts`** / **`src/infrastructure/i18n/index.ts`** — Locale and catalogue metadata consumed during translation planning.
- **`src/kernel/translation.ts`** — Translation planning, availability checks, and batch-write helpers.
- **`src/types/index.ts`** — `ProductTranslationFields` shape used in `NAMED_PRODUCT_COPY`.

## Notes

- Every named row seeds at `onHand: 0`. The out-of-stock row (`scratchPostOutOfStock`) is the one that *never* receives an opening receipt; all others are restocked by the `shop-history` flow. Confusing "seeded at zero" with "permanently out of stock" is a common misread.
- `barebones` deliberately omits `description`, `categories`, `tags`, and `imageUrl` to exercise UI branches that must not assume those fields are present. It is the only named row with no image.
- `heaterSoftDeleted` (soft-deleted) and `bundleInactive` (inactive) are independent states: `publicScope()` requires active AND not-deleted, so externally they look the same, but the dataset keeps them distinct for filter tests.
- Images are never hand-placed; they come from `products-images.generated.json` (generated via `npm run scenario:images`). The filler rows cycle a fixed 20-image pool, so adding rows never requires new assets.
- `en` translations are mandatory and are also the source for the flat `title`/`description` index columns on the product document. `it` is optional; a product can legitimately exist in English alone.
- The file is consumed in two contexts: `scenarios/apply.ts` (live demo DB) and `tests/integration/scenarios/shop.test.ts` (throwaway test DB). Behavior must be idempotent for both.
