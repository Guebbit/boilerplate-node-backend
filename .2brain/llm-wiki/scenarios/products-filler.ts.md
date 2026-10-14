---
source: scenarios/products-filler.ts
sha256: 045909c5050756a790978cd657e58fdbfae5127c05a127a701da4d233dfc3962
generated_at: 2026-10-14T06:59:38.037170+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products-filler.ts

## Purpose

Deterministic, combinatorial product filler for a pet-supply demo catalogue. It produces every Animal × ProductType × Tier combination (6 × 7 × 3 = 126 grid rows) plus two digital-guide rows, all with bilingual (EN/IT) copy, prices, weights, and tax classes. It intentionally avoids randomness so the catalogue is identical on every boot and restore, sidestepping the `@faker-js/faker` EM-only dependency that breaks `ts-jest`.

## Key elements

- **`FILLER_IMAGE_ROLE_KEYS`** — Fixed array of 20 keys (`filler-00`…`filler-19`) used as stable image-slot identifiers; `scenarios/products.ts` cycles through them by index regardless of grid size.
- **`ANIMALS`** (6 entries) — Species axis; each carries an English name, a category slug, and an Italian plural for template interpolation.
- **`PRODUCT_TYPES`** (7 entries) — Product-line axis; each carries name, slug, blurb, base price, shipping weight, optional `tax` override, and Italian counterparts.
- **`TIERS`** (3 entries) — Price/quality axis (Standard, Premium, Heavy-Duty); each carries a `priceMultiplier`, a copy qualifier, and Italian equivalents.
- **`FillerProduct`** (exported interface) — Shape of one row: title, description, price, `openingStock`, categories, tags, weight, optional `taxClass`/`rateType`, optional `requiresShipping: false`, and a `translations` object with parallel EN/IT copies.
- **`GRID_PRODUCTS`** — The 126-row flatMap over the three axes. Prices are `basePrice × multiplier + animalIndex × 2`; stock and weight vary deterministically by tier and type index.
- **`DIGITAL_GUIDES`** — Two `requiresShipping: false` rows (Dog/Cat care PDFs) appended after the grid to preserve grid indices.
- **`FILLER_PRODUCTS`** (exported const) — Concatenation of `GRID_PRODUCTS` + `DIGITAL_GUIDES` (128 rows total).
- **`fillerId(index)`** (exported, truncated) — Returns a stable 24-hex string for a given row index, avoiding `new Types.ObjectId()` so `scenario:apply` upserts remain idempotent.

## Relationships

- **`src/types/index.ts`** — Imports `RateType` and `TaxClass` for the optional tax fields on `FillerProduct`.
- **`scenarios/products.ts`** — Consumes `FILLER_PRODUCTS` and `FILLER_IMAGE_ROLE_KEYS`, attaching a real ObjectId (via `fillerId`) and a cycled image URL to each row before upsert.
- **`scenarios/flows/shop-history.ts`** — Reads each row's `openingStock` and posts it through `POST /inventory/receipts`, so the shop's initial inventory comes from the app's own receipt flow rather than a pre-seeded stock column.
- **`scenarios/tools/generate-seed-images.ts`** — The `npm run scenario:images` script that downloads 20 placeholder photos into the slots named by `FILLER_IMAGE_ROLE_KEYS`.

## Notes

- `openingStock` is **not** a seeded DB column; it is a value the shop-history flow uses to issue a receipt. The actual `onHand` field is written at `0` on insert.
- Grid rows are always `active: true` and non-deleted. The six hand-written rows in `scenarios/products.ts` carry the soft-deleted, inactive, and out-of-stock states, so a filler row is never mistaken for one of them.
- Italian animal names are stored in **plural** form (`namePlural`) because every description template reads "per i proprietari di {animali}".
- The `translations` object duplicates the flat `title`/`description` for the EN locale by construction (same template call), so the two can never drift apart.
- Adding an animal, type, or tier only means more rows sharing the existing 20 images — no new downloads are required.
