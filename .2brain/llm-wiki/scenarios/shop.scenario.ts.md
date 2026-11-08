---
source: scenarios/shop.scenario.ts
sha256: 2988d958f6b7b809118790efe36fc50b28add1f65d67907f2cb5cfbd23b64344
generated_at: 2026-11-08T02:32:13.295728+00:00
model: ollama:qwen3.8:27b
---

# scenarios/shop.scenario.ts

## Purpose

Defines the `shop` scenario object — its seed sequence, drive function, and pinned subject rows — that `scenarios/index.ts` registers under the name `shop`. It is auto-discovered by `npm run regenerate` (via `scenarios/scenarios.generated.ts`); the regeneration strip deletes this file rather than editing the registry.

## Key elements

- **`seedShop`** (internal) — Seeds the access model first (via `seedAccessModel`), then all `shopModules` fixtures in the minimum sequential waves their `after` graph allows (via `runInWaves` / `asWaveEntries`). Returns a flat array of `SeedOutcome[]`.
- **`SHOP_SUBJECTS`** (internal) — A `Readonly<Record<string, string>>` mapping each product guarantee key (e.g. `'product.softDeleted'`, `'product.inStock'`) to a concrete seed row ID from `SEED_PRODUCT_IDS`. Serves as the pinned-side of a two-way equality check in `tests/integration/scenarios/shop.test.ts`.
- **`scenario`** (export) — The single export: `{ seed: seedShop, drive: driveShopHistory, subjects: SHOP_SUBJECTS }`. This is the shape `scenarios/index.ts` consumes.

## Relationships

- **`scenarios/accounts.ts`** — Provides `seedAccessModel`, which must run before any shop module so that a shop exists for membership resolution.
- **`scenarios/product-ids.ts`** — Provides `SEED_PRODUCT_IDS`, the row-ID constants that populate `SHOP_SUBJECTS`.
- **`scenarios/shop-modules.ts`** — Provides `shopModules` (the fixture rows to seed) and `asWaveEntries` (shapes them for the wave runner).
- **`scenarios/waves.ts`** — Provides `runInWaves`, which executes the shop-module entries respecting their `after` dependency graph.
- **`scenarios/flows/shop-history.ts`** — Provides `driveShopHistory`, the order-book flow that drives the seeded shop after seeding.
- **`scenarios/seed.ts`** — Provides the `SeedOutcome` type used in `seedShop`'s return signature.

## Notes

- A freshly seeded shop has an **empty catalogue shelf** (every product at `onHand: 0`); stock only arrives once `driveShopHistory` runs.
- Only `product.*` guarantees pin a row ID here. Other guarantee types name rows that flows produce at runtime, so those IDs do not exist at seed time and are intentionally absent from `SHOP_SUBJECTS`.
- The two-way test in `tests/integration/scenarios/shop.test.ts` means a guarantee declared in a module's `AppModule.scenario` but missing from `SHOP_SUBJECTS` (or vice-versa) will fail the suite.
