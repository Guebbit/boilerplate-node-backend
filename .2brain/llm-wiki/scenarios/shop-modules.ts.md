---
source: scenarios/shop-modules.ts
generated_at: 2026-11-22T01:45:48.356969+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/shop-modules.ts

## Purpose
Defines the per-module fixture table for the `shop` scenario: the rows that exist before anyone uses the shop. It is kept separate from `scenarios/index.ts` so that `scenarios/blank.ts` can read it too, without the two files importing each other. `scenarios/index.ts` builds both `blank` and `shop` from these entries.

## Key elements
- **`ShopModuleEntry`** (interface): one table entry.
  - `seed`: seeds the module's fixtures and returns `SeedOutcome[]`.
  - `after?`: names of other entries this one's write depends on.
  - `baseline?`: marks entries that `blank` also seeds.
  - `driveHistoryEdit?`: a demo-history step this entry contributes, taking a `Caller`.
- **`shopModules`**: the table itself. It is taken from `shopModuleFixtures` in the generated `./shop-modules.generated` module and typed with `satisfies Record<string, ShopModuleEntry>`.
- **`asWaveEntries(entries)`**: reshapes a `shopModules`-like table into `Record<string, WaveEntry<SeedOutcome[]>>` for `runInWaves`/`waveOrder`. Each entry's `seed` becomes `run`, and `after` is carried over.
- **`historyEdits()`**: returns every `driveHistoryEdit` function in table order, skipping entries without one.
- **`baselineShopModules()`**: returns the subset of `shopModules` whose `baseline` is truthy.

## Relationships
- **`scenarios/waves.ts`**: supplies the `WaveEntry` type that `asWaveEntries` targets. Per its docs, an `after` name missing from the table is ignored.
- **`scenarios/seed.ts`**: supplies the `SeedOutcome` type.
- **`scenarios/flows/client.ts`**: supplies the `Caller` type used by `driveHistoryEdit`.
- **`scenarios/index.ts`**: builds `blank` and `shop` from these entries. The `driveHistoryEdit` doc says the history steps are run by whatever scenario calls its `Scenario.drive`.
- **`scenarios/blank.ts`**: runs `baselineShopModules()` (via `asWaveEntries`) alongside its own fixtures.
- **`scenarios/flows/shop-history.ts`** and **`scenarios/shop.scenario.ts`**: neighbors in the graph. This file does not reference them directly.

## Notes
- The table is collected from the `shopModule` export of each `scenarios/<module>.ts` rather than listed by hand, so adding or deleting a module file adds or removes its entry.
- `shopModules` uses `satisfies` rather than an annotation on purpose. An annotation would widen the keys to `string`, and `./check.ts`'s compile-time check reads the literal keys from `keyof typeof shopModules`.
- `historyEdits` and `baselineShopModules` first widen `shopModules` to `Record<string, ShopModuleEntry>`. The literal entry types differ from one another, so they cannot be filtered by a field that not every entry carries.
- `locales` is currently the only `baseline` entry, because a spec that creates its own product still needs the fallback language active.
- `users` is not baseline. `blank` seeds the 13 named accounts through `seedNamedUsersCollection`, not the full demo set that this entry's `seed` writes.
- Orders, payments, shipments, stock movements, reservations, carts and audit entries are deliberately absent. They are what using the shop produces, not baseline fixtures.
