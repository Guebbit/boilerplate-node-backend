---
source: scenarios/products-filler.ts
source_sha256: 3f8486a7739a6ec7c20524244a27fbd85e10026895c288148d0c7ef463477c8d
context_sha256: e0af5f47777d4b8506a93289c85855d444260ae2d822d773b4d37ab79bccc684
generated_at: 2026-11-22T01:44:34.521681+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/products-filler.ts

## Purpose
Generates the catalogue's "filler" products for a pet-supply retailer demo shop. It does this with plain nested loops over hand-picked words, not randomness or `@faker-js/faker`, so the same rows come out on every boot and restore. It only produces words, prices, stock and metadata. `./products` attaches ids and images to each row.

## Key elements
- `FILLER_IMAGE_ROLE_KEYS`: a fixed pool of 20 image role keys (`filler-00` … `filler-19`). Its size does not depend on how many products exist, so adding rows never needs new photos.
- `FillerProduct` (exported interface): one filler row. It holds title, description, decimal-string price, `openingStock`, category slugs, tags and optional `weight`. It also has optional `taxClass`, `rateType` and `requiresShipping: false` (digital goods). `translations` carries `en` and `it` copy.
- `ANIMALS`, `PRODUCT_TYPES`, `TIERS` (module-private): the three axes of the grid.
  - `ANIMALS`: 6 species, each with an Italian plural name.
  - `PRODUCT_TYPES`: 7 product lines, each with a blurb, base price, weight, optional non-standard `tax` and Italian copy.
  - `TIERS`: Standard, Premium (×1.6) and Heavy-Duty (×1.3), with English and Italian qualifiers.
- `GRID_PRODUCTS`: every animal × type × tier combination (6 × 7 × 3).
  - Titles and descriptions are built from the English and Italian templates. The flat `title` and `description` come from the same `en` object as `translations.en`, so they cannot drift apart.
  - Price is `round(basePrice × multiplier) + animalIndex × 2`, formatted with two decimals.
  - `openingStock` is `max(5, 60 − tierIndex×15 − typeIndex×3 + animalIndex×2)`.
  - Weight is `type.weight + tierIndex × 100`.
  - The type's `tax` is spread into the row.
- `DIGITAL_GUIDES`: two downloadable PDF care guides, for Dog and Cat. They are priced at `'9.00'` with `openingStock` 100, tagged `digital` and `guide`, and marked with `requiresShipping`. They are appended after the grid.

## Relationships
- `scenarios/products.ts` consumes this file's rows and `FILLER_IMAGE_ROLE_KEYS`. It adds the id and image, cycling through the role keys by index. It also writes the translation batch from `translations`, and it holds the six named rows for the soft-deleted, inactive and out-of-stock states.
- `scenarios/flows/shop-history.ts` stocks the products. `openingStock` is not a seeded column. The flow receives it through `POST /inventory/levels/{productId}/receive`.
- `scenarios/tools/generate-seed-images.ts` (`npm run scenario:images`) populates the images behind the role keys.
- `src/types/index.ts` provides the `RateType` and `TaxClass` types used by `FillerProduct`.

## Notes
- The grid uses array order for ids and pictures. Digital guides are appended after the grid so existing rows keep their index, and with it their id and image. Insert new rows at the end of the arrays.
- Every grid row is active and non-deleted, and gets an opening receipt. The special states (soft-deleted, inactive, out-of-stock) are never produced here.
- Tax is set per product type. Feeding Bowl is `zero` with `zero_rated`, Water Dispenser is `zero` with `exempt`, Health Supplement is `reduced`, and the rest use the standard rate.
- The Italian Heavy-Duty tier is named "Extra Resistente" because it is invariant across the grammatical genders of the type nouns.
