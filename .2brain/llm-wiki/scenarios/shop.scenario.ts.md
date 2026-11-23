---
source: scenarios/shop.scenario.ts
source_sha256: 96dbd6f3ee297798caab61b982f23563513036a3b5498ea21a7b778ccacb918b
context_sha256: b375af9f7bcefd4edf01cc9188f9981bc500b49945e9f452c325f8c46f4a0ba1
generated_at: 2026-11-22T01:46:00.999953+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/shop.scenario.ts

## Purpose
Defines the `shop` scenario: the starting rows (access model plus every `shopModules` fixture), the driver that plays the order-book history on top, and the pinned subject rows that tests check against module guarantees. It is discovered by `npm run regenerate`, so removing a scenario means deleting this file rather than editing the registry that lists it.

## Key elements
- `seedShop` (private): runs `seedAccessModel()`, then `runInWaves(asWaveEntries(shopModules))`, and flattens the per-wave results into one `SeedOutcome[]`. Seeding is sequential: the access model first, then the module fixtures in the fewest waves their `after` graph allows.
- `SHOP_SUBJECTS` (private): a `Record<string, string>` that maps guarantee keys to row ids from `SEED_PRODUCT_IDS`. The keys are `product.softDeleted`, `inactive`, `offSale`, `outOfStock`, `barebones`, `inStock`, `rich`, `digital`, `lowStock`, `noWithdrawal` and `heavy`. Only `products` pins a row here.
- `scenario` (export): the object `scenarios/index.ts` registers as `shop`. It has the fields `seed: seedShop`, `drive: driveShopHistory` and `subjects: SHOP_SUBJECTS`.

## Relationships
- `./accounts`: supplies `seedAccessModel`, which runs before everything else, because nothing can resolve a caller until a shop exists for them to be a member of.
- `./shop-modules`: supplies `shopModules` (the fixtures) and `asWaveEntries` (adapts them for the wave runner).
- `./waves`: supplies `runInWaves`, which orders and executes the module seeding.
- `./product-ids`: supplies `SEED_PRODUCT_IDS`, the source of the pinned subject ids.
- `./flows/shop-history`: supplies `driveShopHistory`, used as the `drive` step.
- `./seed` (imported as `@scenarios/seed`): supplies the `SeedOutcome` type.

## Notes
- A shop that has been seeded but not driven has an empty catalogue shelf: no product carries stock, and each product takes delivery from the flow run.
- Guarantees other than the product ones name rows that the flows produce. Those ids only exist after a process has run the flows, so they are not pinned here.
- The subjects are meant to match, in both directions, the guarantees that modules declare themselves. A guarantee that is declared but not pinned is a failure, and so is a subject left here after its module is deleted.
