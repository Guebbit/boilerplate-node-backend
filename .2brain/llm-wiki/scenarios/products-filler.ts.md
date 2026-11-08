---
source: scenarios/products-filler.ts
sha256: df3218ac1c1e6e2c985035d6ba4127ae233706a2b7e147fea9c477db74a837a9
generated_at: 2026-11-08T02:30:56.503364+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products-filler.ts

## Purpose

Produces the deterministic, combinatorial portion of the demo pet-supply catalogue: a fixed 6-animal × 7-product-type × 3-tier grid (126 rows) plus two digital PDF guides, all with bilingual (EN/IT) copy. It exists so `scenarios/products.ts` can attach stable ids and image URLs without this file needing to know about either, and so every boot and every restore yields byte-identical rows (no randomness, no `@faker-js/faker`).

## Key elements

- **`FILLER_PRODUCTS: FillerProduct[]`** — The main export. 126 grid rows followed by 2 digital rows. Consumed by `scenarios/products.ts`.
- **`FillerProduct`** (interface) — Shape of one row: title, description, price, `openingStock`, categories, tags, optional `weight`/`taxClass`/`rateType`/`requiresShipping`, and a `translations` object holding both locales' copy.
- **`FILLER_IMAGE_ROLE_KEYS: string[]`** — 20 fixed keys (`filler-00`…`filler-19`) that `scenarios/tools/generate-seed-images.ts` populates. `scenarios/products.ts` cycles through them by index regardless of grid size.
- **`ANIMALS`, `PRODUCT_TYPES`, `TIERS`** (const arrays) — The three axes. Each carries EN + IT copy fragments (names, slugs, blurbs, qualifiers, multipliers).
- **`GRID_PRODUCTS`** (const) — The `flatMap`/`map` combination producing the 126 rows. Price = `basePrice × multiplier + animalIndex * 2`. Weight = `type.weight + tierIndex * 100`.
- **`DIGITAL_GUIDES`** (const) — Two `requiresShipping: false` rows (Dog/Cat Care Guide PDF). Appended after the grid so grid indices (and thus derived ids/images) are stable.
- **`fillerId(index)`** (exported function, truncated) — Deterministic 24-hex id for row `index`; avoids `new Types.ObjectId()` whose time-based default would break `scenario:apply` idempotency.

## Relationships

- **`scenarios/products.ts`** — Primary consumer. Iterates `FILLER_PRODUCTS`, assigns `fillerId(i)` as the `_id`, pairs each row with `FILLER_IMAGE_ROLE_KEYS[i % 20]`, and writes the combined catalogue (named rows + filler) to the DB.
- **`scenarios/flows/shop-history.ts`** — Reads each filler row's `openingStock` and calls `POST /inventory/levels/{productId}/receive` to place that quantity on the shelf, so the shop's stock originates from an in-app receipt rather than a pre-seeded column.
- **`scenarios/tools/generate-seed-images.ts`** — Reads `FILLER_IMAGE_ROLE_KEYS` to know which image slots to fetch/generate into `products-images.generated.json`.
- **`src/types/index.ts`** — Supplies the `RateType` and `TaxClass` types used in `FillerProduct`'s optional tax fields.

## Notes

- **No randomness by design.** The file header explicitly documents that the repo avoids `@faker-js/faker` (ESM-only, breaks ts-jest) and that a demo catalogue has even less reason for non-determinism than a test file.
- **Grid rows are always active, non-deleted, in-stock.** Soft-deleted / inactive / out-of-stock states are reserved for the six hand-written named rows in `scenarios/products.ts`, preventing confusion.
- **`openingStock` is not a DB column.** It is a one-time input to the shop-history flow; the seeded `onHand` value is always `0`.
- **Digital guides are appended last** so that `gridRow[i]` always maps to the same id and image slot, even if guides are added or removed.
- **Italian "Heavy-Duty" tier** is rendered as "Extra Resistente" (a noun phrase) rather than an inflected adjective, avoiding gender agreement across mixed-gender product nouns (cuccia, trasportino, ciotola, …).
- **`translations` is a convenience batch** for the write surface's translation endpoint. The flat `title`/`description` fields are guaranteed identical to `translations.en` because they come from the same template call.
