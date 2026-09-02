# src/modules/products/demo-catalog.ts

## Purpose

Generates the full demo product catalogue via deterministic nested-loop combinations (6 animals × 7 product types × 3 tiers = 126 rows). It exists to provide a byte-stable, non-random filler dataset so that `assembleDemoDataset()` and `db:seed` produce identical output on every run — critical for idempotent upserts and reproducible test fixtures. This file deals only in words, prices, and stock counts; it never assigns IDs or images.

## Key elements

- **`FILLER_IMAGE_ROLE_KEYS`** (exported `string[20]`) — fixed pool of keys (`filler-00` … `filler-19`) that `npm run seed:images` populates. Size is decoupled from catalogue size; `./demo` cycles through them by index.
- **`AnimalLine`, `ProductType`, `Tier`** (private interfaces + arrays) — the three dimensions of the combinatorial grid. `ProductType` carries a `basePrice` and a `blurb`; `Tier` carries a `priceMultiplier` and a `qualifier` phrase.
- **`FillerProduct`** (exported interface) — the shape of one filler row: `key`, `title`, `description`, `price`, `onHand`, `categories`, `tags`. No `id` or `imageUrl` here; those are added by `./demo`.
- **`FILLER_PRODUCTS`** (exported `FillerProduct[]`, 126 entries) — the fully expanded catalogue. All rows are active, in-stock, non-deleted.
- **`fillerProductId(index)`** (exported function) — returns a syntactically valid 24-char hex string (`"67f0c1"` + zero-padded hex index) so the same row always maps to the same ObjectId.

## Relationships

- **`src/modules/products/demo.ts`** — primary consumer. Imports `FILLER_PRODUCTS`, `FILLER_IMAGE_ROLE_KEYS`, and `fillerProductId` to attach a real `_id` and an `imageUrl` (cycling through the 20 role keys) to each row before assembling the final demo dataset.
- **`scripts/generate-seed-images.ts`** — the `npm run seed:images` script that downloads and writes the 20 placeholder images whose filenames correspond to the keys in `FILLER_IMAGE_ROLE_KEYS`.
- **`src/modules/cart/demo.ts`** / **`src/modules/orders/demo.ts`** — consume the assembled demo dataset (which includes these filler rows) to seed cart and order fixtures that reference concrete product IDs.

## Notes

- **No randomness, ever.** The header docblock explicitly rejects `@faker-js/faker` (ESM-only, breaks `ts-jest`) and any `Math.random`-style approach. Every field is a pure function of array indices.
- **`key` is a stable slug** (`{animal}-{type}-{tier}`) intended to be human-readable in diffs; it is *not* the database ObjectId.
- **Price formula** is `Math.round(basePrice × priceMultiplier) + animalIndex × 2`. The small animal offset keeps prices from collapsing to identical values across species.
- **`onHand`** is always ≥ 5, computed as `60 - tierIndex×15 - typeIndex×3 + animalIndex×2`. No row can end up at zero stock, so the "exactly one soft-deleted/inactive product" invariant in `seed-conformance.test.ts` is preserved (those special states live on the six named rows in `./demo`).
- **`fillerProductId` hard-codes the `"67f0c1"` prefix** (a valid 2024-era timestamp) so the result looks like a real ObjectId without actually calling the time-based constructor.
