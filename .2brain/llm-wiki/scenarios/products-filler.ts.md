---
source: scenarios/products-filler.ts
sha256: 944bf8cdce4534f0eeadaae56ebdc75546f2f24959d45b051ca5dd703121bd69
generated_at: 2026-10-29T01:24:25.316895+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products-filler.ts

## Purpose

Generates a deterministic, bilingual (EN/IT) pet-supply product catalogue by combinatorially crossing a fixed set of animals, product types, and quality tiers via nested loops. It exists to supply a large, repeatable filler catalogue for demo/seed scenarios without introducing randomness (the repo avoids `@faker-js/faker` due to its ESM-only packaging breaking ts-jest). It produces rows of "words only"; `scenarios/products.ts` later attaches IDs and images.

## Key elements

- **`FILLER_IMAGE_ROLE_KEYS`** – A fixed array of 20 slugs (`filler-00` … `filler-19`) that `scenarios/products.ts` cycles through by index when assigning images. Growing the product grid never requires new photos.
- **`ANIMALS`** (const, 6 entries) – Species axis: name, category slug, and Italian plural form.
- **`PRODUCT_TYPES`** (const, 7 entries) – Product line axis: name, slug, blurb, base price (whole units), weight in grams, optional `tax` (zero-rated, exempt, or reduced), and Italian copy.
- **`TIERS`** (const, 3 entries) – Quality/price axis: name, slug, price multiplier (1, 1.6, 1.3), a qualifier phrase, and Italian copy.
- **`FillerProduct`** (exported interface) – The row shape: title, description, price, `openingStock`, categories, tags, optional `weight`, optional `taxClass`/`rateType`, optional `requiresShipping: false` for digital goods, and a `translations` object carrying both locales.
- **`GRID_PRODUCTS`** (const) – The 6 × 7 × 3 = 126-row flat array produced by `flatMap` over animals, types, and tiers. Prices are `round(basePrice × multiplier) + animalIndex × 2`; stock is a simple linear expression of the three indices.
- **`DIGITAL_GUIDES`** (const) – Two PDF guides (Dog, Cat) with `requiresShipping: false`, no `weight`, and a fixed `openingStock` of 100.
- **`FILLER_PRODUCTS`** (exported const) – `[...GRID_PRODUCTS, ...DIGITAL_GUIDES]`; 128 rows total. Order is stable so downstream index-based ID/image assignment is deterministic.
- **Stable ID helper** (exported, truncated) – Derives a deterministic 24-hex string from a row's index, avoiding `Types.ObjectId()`'s time-based default so `scenario:apply` upserts remain idempotent.

## Relationships

- **`scenarios/products.ts`** – Consumes `FILLER_PRODUCTS`, assigns each row a stable ID (via the helper exported here) and an image (cycling `FILLER_IMAGE_ROLE_KEYS` by index), then merges these with the six hand-written "named" rows into the final seed catalogue.
- **`scenarios/flows/shop-history.ts`** – After seeding, drives `POST /inventory/levels/{productId}/receive` for each filler row's `openingStock`, so the shop's stock originates from an in-app receipt rather than a pre-set column.
- **`scenarios/tools/generate-seed-images.ts`** – The `npm run scenario:images` script that downloads and stores the 20 images corresponding to `FILLER_IMAGE_ROLE_KEYS` into `./products-images.generated.json`.
- **`src/types/index.ts`** – Provides the `RateType` and `TaxClass` types used in the optional `tax` field of `ProductType` and in `FillerProduct`.

## Notes

- **No randomness.** Every value (price, stock, weight, title) is a pure function of the three loop indices and the static tables. Two boots, two restores, and any CI run produce byte-identical rows.
- **Digital rows are appended, not interleaved.** The two guides sit after all 126 grid rows so that grid-row index → ID → image mapping is unaffected.
- **`openingStock` is not a DB column.** It is consumed by the shop-history flow to simulate an opening receipt; the seeded column is `onHand: 0`.
- **Italian copy is always plural** for the animal (`Cani`, `Gatti`, …) because the templates read "proprietari di {animali}". The tier qualifiers are written to be gender-neutral to accommodate the mixed-gender product nouns.
- **Tax is per product-type, not per row.** `Feeding Bowl` is `zero-rated`, `Water Dispenser` is `exempt`, `Health Supplement` is `reduced`; the remaining four types inherit the shop's standard rate (field absent).
