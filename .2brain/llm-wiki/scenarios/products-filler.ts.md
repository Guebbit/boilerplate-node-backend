---
source: scenarios/products-filler.ts
sha256: acbaf6bc95e573e803666bc300c897a2b4863dd3f3c6a9124daf7dc80c248f69
generated_at: 2026-10-01T12:22:32.947086+00:00
model: ollama:qwen3.8:27b
---

# scenarios/products-filler.ts

## Purpose

Generates a deterministic pet-supply catalogue by taking the Cartesian product of six animals, seven product types, and three quality tiers (126 rows), then appends two digital PDF guides. It is a plain nested-loop combinator with hand-picked English and Italian copy — no randomness — so the same rows appear on every boot and every restore. It exists because the repo avoids `@faker-js/faker` (ESM-only, breaks ts-jest) and a demo catalogue needs byte-for-byte reproducibility even more than a test fixture does. This file only produces words; `./products` is responsible for ids, images, and persistence.

## Key elements

- **`FILLER_IMAGE_ROLE_KEYS`** — exported `string[20]` (`filler-00` … `filler-19`). A fixed image-role pool that `./products` cycles through by index; growing the grid never requires a new photo.
- **`ANIMALS`** (private) — six `AnimalLine` entries (Dog, Cat, Rabbit, Bird, Reptile, Small Animal) each with an English name, a slug, and an Italian plural name.
- **`PRODUCT_TYPES`** (private) — seven `ProductType` entries (Bed, Carrier, Feeding Bowl, Water Dispenser, Grooming Kit, Enrichment Toy, Health Supplement) with `basePrice`, `weight`, optional `tax`, and EN/IT name + blurb.
- **`TIERS`** (private) — three `Tier` entries (Standard ×1.0, Premium ×1.6, Heavy-Duty ×1.3) with a price multiplier and a localised marketing qualifier.
- **`GRID_PRODUCTS`** (private) — the full 6 × 7 × 3 = 126-row array produced by `flatMap`-ing the three axes; each row carries `price`, `openingStock`, `categories`, `tags`, `weight`, optional tax fields, and a `translations` object (`en` + `it`).
- **`DIGITAL_GUIDES`** (private) — two `FillerProduct` rows (Dog Care Guide, Cat Care Guide) with `requiresShipping: false`, no `weight`, and a fixed price of 9.
- **`FILLER_PRODUCTS`** — exported `FillerProduct[]`; the grid followed by the digital guides. This is the array `./products` consumes.
- **`fillerId(index)`** — exported; returns a stable 24-hex ObjectId string for row `index` (deterministic, not time-based).
- **`FillerProduct`** — exported interface describing one filler row before `./products` attaches its id and image.

## Relationships

- **`scenarios/products.ts`** — the direct consumer. It reads `FILLER_PRODUCTS`, calls `fillerId` for each row, cycles `FILLER_IMAGE_ROLE_KEYS` by index to assign an image, and writes the rows into the database (all at `onHand: 0`).
- **`scenarios/flows/shop-history.ts`** — reads each row's `openingStock` and POSTs it to `/inventory/receipts`, so the shop's initial stock is stock the app itself received rather than a seeded column.
- **`scenarios/tools/generate-seed-images.ts`** — populates the 20 image files under the keys listed in `FILLER_IMAGE_ROLE_KEYS` (invoked via `npm run scenario:images`).

## Notes

- **Determinism is load-bearing.** `fillerId` deliberately avoids `new Types.ObjectId()` (time-based) so `scenario:apply`'s upsert is idempotent. Do not replace it with a random id.
- **Grid index = identity.** The digital guides are appended *after* the grid so that every grid row keeps its positional index, which in turn pins its id and its image slot. Reordering would silently remap ids and images.
- **`openingStock` is not a DB column.** It is the quantity the receipt flow stocks. Filler rows always seed with `onHand: 0`.
- **Filler rows are always active and non-deleted.** The six hand-written named rows in `./products` carry the soft-deleted / inactive / out-of-stock states, so a filler row can never be mistaken for one of them.
- **Italian copy uses plural animal names** (`Cani`, `Gatti`, …) because every template reads "per i proprietari di {animali}". The Heavy-Duty tier name is "Extra Resistente" (gender-neutral) to avoid agreement errors with the mix of masculine/feminine product nouns.
- **Price formula:** `round(basePrice × tierMultiplier) + animalIndex × 2`. **Stock formula:** `max(5, 60 − tierIndex×15 − typeIndex×3 + animalIndex×2)`. These produce varied but reproducible numbers across the grid.
