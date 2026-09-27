---
source: scenarios/shop-modules.ts
sha256: 11968737a381ea8e8c4931fa4d7c48eef82b764c2337e5873627e847936c9e1f
generated_at: 2026-09-27T13:51:08.110582+00:00
model: ollama:qwen3.8:27b
---

# scenarios/shop-modules.ts

## Purpose

Declares the per-module fixture table for the `shop` scenario — which modules seed pre-usage data, their scheduling dependencies, and which entries are shared with the `blank` scenario. It lives in its own file so both `index.ts` (which builds the full `shop` scenario) and `blank.ts` (which seeds only baseline fixtures) can read the same entries without importing each other.

## Key elements

- **`ShopModuleEntry`** (interface) — the shape of one table row: `seed` (the seeding function), `after` (ordering dependencies), `baseline` (also needed by `blank`), `driveHistoryEdit` (optional demo-history callback).
- **`shopModules`** (const, `satisfies Record<string, ShopModuleEntry>`) — the six entries: `addresses`, `locales`, `products`, `users`, `webhooks`, `wishlist`. Orders, payments, carts, etc. are intentionally absent (they are *produced* by `flows/shop-history.ts`, not seeded).
- **`asWaveEntries(entries)`** — reshapes a `ShopModuleEntry` table into the `WaveEntry<SeedOutcome[]>` shape that `waves.ts`'s `runInWaves` / `waveOrder` consume.
- **`baselineShopModules()`** — filters `shopModules` down to entries where `baseline: true`, returning a plain record for `blank.ts` to use via `asWaveEntries`.

## Relationships

- **`scenarios/seed.ts`** — source of the `SeedOutcome` type used as the return of every `seed` function.
- **`scenarios/waves.ts`** — source of the `WaveEntry` type; `asWaveEntries` is the adapter between this file's table and `waves.ts`'s scheduling API.
- **`scenarios/flows/client.ts`** — source of the `Caller` type used as the parameter of `driveHistoryEdit`.
- **`scenarios/addresses.ts`, `locales.ts`, `products.ts`, `users.ts`, `webhooks.ts`, `wishlist.ts`** — each contributes a `seedXCollection` (and `locales.ts` additionally contributes `driveLocaleEntryEdit`) that populates the `shopModules` table.
- **`scenarios/index.ts`** — consumes `shopModules` (all entries) to build the full `shop` scenario.
- **`scenarios/blank.ts`** — consumes `baselineShopModules()` + `asWaveEntries` to seed only baseline fixtures alongside its own named-user fixtures.
- **`scenarios/flows/shop-history.ts`** — calls each entry's `driveHistoryEdit` to produce the post-usage story (orders, payments, etc.).

## Notes

- `satisfies` (not a type annotation) is used deliberately so that `keyof typeof shopModules` yields the six literal keys, which `check.ts` reads at compile time. An annotation would widen them to `string`.
- `products` declares `after: ['locales']` because `planTranslations` requires the fallback locale to already exist as an ACTIVE row before product translations can be written.
- `users` is **not** `baseline: true`. `blank.ts` seeds its own four named accounts via `seedNamedUsersCollection`; the full demo user set this entry writes is shop-specific.
- The only `baseline: true` entry today is `locales`. Any new entry shared with `blank` must be added here, not duplicated in `blank.ts`.
