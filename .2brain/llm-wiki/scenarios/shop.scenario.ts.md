---
source: scenarios/shop.scenario.ts
sha256: 2988d958f6b7b809118790efe36fc50b28add1f65d67907f2cb5cfbd23b64344
generated_at: 2026-10-29T01:25:47.227495+00:00
model: ollama:qwen3.8:27b
---

# scenarios/shop.scenario.ts

## Purpose

Defines the `shop` scenario as a single registered object (`scenario`) with three parts: a `seed` function that loads the access model and all `shopModules` fixture rows, a `drive` function that replays the order-book history, and a `subjects` map that pins row IDs to product guarantees. It is the concrete scenario that `scenarios/index.ts` exposes under the name `shop`.

## Key elements

- **`seedShop`** (local) — Seeds the access model via `seedAccessModel()`, then runs every `shopModules` entry in dependency-ordered waves via `runInWaves(asWaveEntries(shopModules))`. Flattens the per-wave `SeedOutcome` arrays into a single list.
- **`SHOP_SUBJECTS`** (local, `Readonly<Record<string, string>>`) — Maps each product guarantee key (e.g. `product.softDeleted`, `product.digital`) to a concrete seeded row ID pulled from `SEED_PRODUCT_IDS`. Serves as the "pinned" half of the bidirectional contract checked in `tests/integration/scenarios/shop.test.ts`.
- **`scenario`** (exported) — The public object `{ seed, drive, subjects }` consumed by the scenario runner and test harness.

## Relationships

- **`scenarios/accounts.ts`** — Provides `seedAccessModel`, which must complete before any shop row is seeded (no caller resolves until a shop exists).
- **`scenarios/shop-modules.ts`** — Supplies the `shopModules` fixture array and the `asWaveEntries` adapter that shapes those entries for the wave runner.
- **`scenarios/waves.ts`** — Provides `runInWaves`, which respects each entry's `after` graph to order sequential seed steps.
- **`scenarios/product-ids.ts`** — Exports `SEED_PRODUCT_IDS`, the source of every row ID referenced in `SHOP_SUBJECTS`.
- **`scenarios/flows/shop-history.ts`** — Exports `driveShopHistory`, bound directly as `scenario.drive`.
- **`scenarios/seed.ts`** — Exports the `SeedOutcome` type used for the return type of `seedShop`.
- **`scenarios/scenarios.generated.ts`** — The auto-generated registry that discovers this file at `npm run regenerate` time; regeneration deletes this file rather than hand-editing the registry.

## Notes

- The doc block states a seeded-but-undriven shop has an empty catalogue: every product starts at `onHand: 0` and only gains stock once the flow run (`driveShopHistory`) executes.
- `SHOP_SUBJECTS` pins **only** `products`-namespace rows. Guarantees in other domains reference rows that come into existence during the drive phase and therefore cannot be pinned at seed time.
- The bidirectional pin contract is enforced by the integration test: a guarantee declared in a module's `AppModule.scenario` but missing from `SHOP_SUBJECTS` (or vice versa) fails the suite.
