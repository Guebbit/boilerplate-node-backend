---
source: scenarios/shop-modules.ts
sha256: 28f97d394cef6f88fa2901fb00697de9fa397568fd9cd4b64882fdc4802c153d
generated_at: 2026-10-29T01:25:36.652762+00:00
model: ollama:qwen3.8:27b
---

# scenarios/shop-modules.ts

## Purpose

Per-module fixture table for the `shop` scenario. It defines the `ShopModuleEntry` shape and the `shopModules` constant (assembled from auto-generated per-module exports), plus helpers that reshape or filter the table. It lives in its own file rather than in `scenarios/index.ts` so that `scenarios/blank.ts` can also consume the baseline subset without creating a circular import between the two scenario builders.

## Key elements

- **`ShopModuleEntry`** — interface describing one row: `seed` (async factory returning `SeedOutcome[]`), optional `after` (names of other rows it depends on), optional `baseline` (also seeded by the `blank` scenario), optional `driveHistoryEdit` (a demo-history step the module contributes).
- **`shopModules`** — the full table, derived from `shopModuleFixtures` (imported from the generated file) and typed with `satisfies` to preserve literal keys.
- **`asWaveEntries(entries)`** — maps a `ShopModuleEntry` table (or a subset) into `Record<string, WaveEntry<SeedOutcome[]>>` for `./waves` scheduling.
- **`historyEdits()`** — collects every `driveHistoryEdit` function in table order; deleting a module removes its step automatically.
- **`baselineShopModules()`** — filters `shopModules` down to entries where `baseline` is `true`, for consumption by `blank.ts`.

## Relationships

- **`scenarios/shop-modules.generated.ts`** — sole data source; exports `shopModuleFixtures` which is the raw table this file re-exports as `shopModules`.
- **`scenarios/waves.ts`** — provides the `WaveEntry` type; `asWaveEntries` adapts this file's entries into the shape `runInWaves`/`waveOrder` expect.
- **`scenarios/seed.ts`** — provides the `SeedOutcome` type used in `ShopModuleEntry.seed`.
- **`scenarios/flows/client.ts`** — provides the `Caller` type used as the argument to `driveHistoryEdit`.
- **`scenarios/blank.ts`** — reads `baselineShopModules()` and `asWaveEntries()` to seed the subset of modules that exist before any shop activity, avoiding a second copy of those fixtures.
- **`scenarios/index.ts`** — builds both the `blank` and `shop` scenarios from this table; calls `historyEdits()` when driving the demo.

## Notes

- `shopModules` uses `satisfies` rather than a type annotation so that `keyof typeof shopModules` yields the literal module names; a plain annotation would widen every key to `string` and break `scenarios/check.ts`'s compile-time validation.
- `baselineShopModules` and `historyEdits` both explicitly widen `shopModules` to `Record<string, ShopModuleEntry>` before iterating, because `satisfies` preserves each entry's own literal shape (which may lack fields like `baseline` or `driveHistoryEdit`).
- The table deliberately excludes post-usage entities (orders, payments, shipments, stock, reservations, carts, audit) — those are produced *by* driving the shop, not prerequisites.
- Adding or removing a module is done by adding or deleting its `scenarios/<module>.ts` file; the generated file picks it up automatically. No manual list is maintained here.
