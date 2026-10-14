---
source: scenarios/shop-modules.ts
sha256: 953fd8098750c8ddf2d61df84a0b4b02c91a5e1501a752a8adb29133f8fb4575
generated_at: 2026-10-14T07:01:34.714881+00:00
model: ollama:qwen3.8:27b
---

# scenarios/shop-modules.ts

## Purpose

Central fixture table for the `shop` scenario's per-module seed data. Extracted from `scenarios/index.ts` so that `blank.ts` can read a subset of the same entries without the two files importing each other. Defines *what* gets seeded, *what order* (via `after`), *which entries* `blank` shares (`baseline`), and *which entries* contribute a demo-history step.

## Key elements

- **`ShopModuleEntry`** (interface) — shape of one row: `seed`, optional `after` (ordering deps), optional `baseline` (also seeded by `blank`), optional `driveHistoryEdit` (history step callback).
- **`shopModules`** (const) — the table itself: `addresses`, `example`, `locales`, `products`, `users`, `webhooks`, `wishlist`. Uses `satisfies` (not a type annotation) so `keyof typeof shopModules` stays literal for `check.ts`.
- **`asWaveEntries(entries)`** — reshapes a `ShopModuleEntry` record into `WaveEntry<SeedOutcome[]>` (maps `seed`→`run`, passes `after`) for consumption by `waves.ts`.
- **`historyEdits()`** — collects all non-null `driveHistoryEdit` callbacks in table order; this is what the scenario drive runs.
- **`baselineShopModules()`** — filters `shopModules` to entries flagged `baseline: true` (currently only `locales`). Returns the narrowed table for `blank.ts`.

## Relationships

- **`scenarios/addresses.ts`, `example.ts`, `locales.ts`, `products.ts`, `users.ts`, `webhooks.ts`, `wishlist.ts`** — imports their respective `seed*Collection` functions (and `locales.ts` also supplies `driveLocaleEntryEdit`).
- **`scenarios/seed.ts`** — imports the `SeedOutcome` type used in the `seed` signature.
- **`scenarios/waves.ts`** — imports `WaveEntry`; `asWaveEntries` output is what `runInWaves`/`waveOrder` consume.
- **`scenarios/flows/client.ts`** — imports the `Caller` type used by `driveHistoryEdit` callbacks.
- **`scenarios/flows/shop-history.ts`** — owns the history flow; the `driveHistoryEdit` callbacks this file collects are the steps it drives.
- **`scenarios/index.ts`** — builds the `shop` scenario from `shopModules`; also builds `blank` using `baselineShopModules()`.
- **`scenarios/blank.ts`** — reads `baselineShopModules()` to seed shared baseline data (locales) without importing `index.ts`.

## Notes

- `products` declares `after: ['locales']` because its write path (`planTranslations`/`writeTranslations` in `@modules/locales/services/translations.ts`) requires the fallback locale to already exist as an ACTIVE row.
- `users` is **not** baseline — `blank` seeds four named accounts via `seedNamedUsersCollection` (in `users.ts`), not the full demo set this entry writes.
- `satisfies` is deliberate: an annotation would widen keys to `string`, breaking `check.ts`'s `keyof typeof shopModules` compile-time guard.
- Rows that represent *usage* artifacts (orders, payments, carts, stock, audit) are intentionally absent; those are produced at runtime by `flows/shop-history.ts`, not seeded here.
