---
source: scenarios/products-filler.ts
sha256: ee2368698d6c196196b757e422eef548ea96f0447db59f539c0a38a563952943
generated_at: 2026-09-23T17:19:00.504321+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products-filler.ts

## Purpose

Deterministic combinatorial catalogue generator for a pet-supply retailer. It builds every Animal × ProductType × Tier combination (6 × 7 × 3 = 126 rows) with bilingual English/Italian copy, a fixed price, an opening-stock quantity, and category/tag metadata. No randomness is involved: the same array is produced on every boot and every restore, keeping the demo catalogue reproducible without `@faker-js/faker` (ESM-only, incompatible with ts-jest).

## Key elements

- **`FILLER_PRODUCTS: FillerProduct[]`** — The 126-row exported catalogue. Each entry carries `title`, `description`, `price`, `openingStock`, `categories`, `tags`, and a `translations` object (`{ en, it }`) so the write surface's translation batch can't drift from the flat fields.
- **`FILLER_IMAGE_ROLE_KEYS: string[]`** — Fixed pool of 20 keys (`filler-00` … `filler-19`) that `./products` cycles through by index when assigning images. Growing the grid never requires new photos.
- **`fillerProductId(index: number): string`** — Returns a deterministic 24-hex ObjectId string for row `index`, avoiding time-based `new Types.ObjectId()` so `scenario:apply`'s upsert stays idempotent.
- **`FillerProduct` (exported interface)** — The row shape *before* `./products` attaches an id and an image. `openingStock` is explicitly **not** a seeded column; it's the quantity the opening receipt flow puts on the shelf.
- **`ANIMALS`, `PRODUCT_TYPES`, `TIERS`** (module-private) — The three axes of the grid. Each entry carries English and Italian `name`, `slug`/`blurb`/`qualifier`, and (for types) a `basePrice`. Tiers supply a `priceMultiplier` and a `qualifier` phrase.

## Relationships

- **`scenarios/products.ts`** — Consumes `FILLER_PRODUCTS` and `fillerProductId`; attaches a real `ObjectId` and an image (chosen from `FILLER_IMAGE_ROLE_KEYS`) to each row before persisting.
- **`scenarios/flows/shop-history.ts`** — Reads each row's `openingStock` and posts it via `POST /inventory/receipts`, so the shop's initial stock is stock the application itself received rather than a pre-seeded column.
- **`scenarios/tools/generate-seed-images.ts`** — The `npm run scenario:images` script that downloads the 20 images whose role keys appear in `FILLER_IMAGE_ROLE_KEYS` (persisted in `products-images.generated.json`).

## Notes

- All 126 filler rows are **active and non-deleted**. Soft-deleted, inactive, and out-of-stock states are deliberately reserved for the six *named* rows in `./products` so a filler row is never mistaken for one of them.
- Price formula: `Math.round(basePrice × tierMultiplier) + animalIndex × 2`. The `animalIndex` term keeps prices distinct across species within the same type/tier.
- Italian animal names are **always plural** (`Cani`, `Gatti`, …) because every description template reads "per i proprietari di {animali}".
- The `translations` object is built from the *same* template call as the flat `title`/`description`, so the two can never diverge.
- `fillerProductId` uses a fixed `67f0c1` prefix; only the 18-hex suffix varies. This is not a real Mongo-generated id but a syntactically valid stand-in that remains stable across runs.
