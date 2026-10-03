---
source: scenarios/shop-modules.ts
sha256: 7674e2728a03249efb320b5210a45010c48555dd0265b27921ec8f347abf9e88
generated_at: 2026-10-01T12:23:48.758664+00:00
model: ollama:qwen3.8:27b
---

# scenarios/shop-modules.ts

## Purpose

Declares the `shop` scenario's per-module fixture table — which collections get seeded before anyone uses the shop, their dependency ordering, whether they are also baseline for `blank`, and which entries contribute a demo-history step. It lives in its own file (not in `scenarios/index.ts`) so that `blank.ts` can read the baseline subset without creating a circular import with `index.ts`.

## Key elements

- **`ShopModuleEntry`** (interface) — the shape of one row: `seed` (the collection seeder), `after?` (ordering dependency by name), `baseline?` (also seeded by `blank`), `driveHistoryEdit?` (optional history step driven by `flows/shop-history.ts`).
- **`shopModules`** (const, `satisfies Record<string, ShopModuleEntry>`) — the six rows: `addresses`, `locales` (baseline, has history edit), `products` (depends on `locales`), `users`, `webhooks`, `wishlist`.
- **`asWaveEntries`** — reshapes a `shopModules`-shaped table into `Record<string, WaveEntry<SeedOutcome[]>>` for `waves.ts`'s `runInWaves`/`waveOrder`.
- **`historyEdits`** — collects every `driveHistoryEdit` callback in table order; a scenario's drive runs this list.
- **`baselineShopModules`** — filters `shopModules` to entries with `baseline: true`; consumed by `blank.ts` via `asWaveEntries`.

## Relationships

- **`scenarios/waves.ts`** — imports `WaveEntry` type; `asWaveEntries` is the adapter that produces `WaveEntry` records for the wave scheduler.
- **`scenarios/flows/client.ts`** — imports `Caller` type, used as the owner parameter in `driveHistoryEdit`.
- **`scenarios/flows/shop-history.ts`** — calls the callbacks returned by `historyEdits()` to write demo-history entries.
- **`scenarios/blank.ts`** — calls `baselineShopModules()` and `asWaveEntries()` to seed the shared baseline subset alongside its own named-account fixtures.
- **`scenarios/index.ts`** — builds both the `blank` and `shop` scenarios from this table (per the module doc); does not import it directly to avoid the `blank` ↔ `index` cycle.
- **`scenarios/seed.ts`** — provides the `SeedOutcome` type used in `ShopModuleEntry.seed` and `asWaveEntries`.
- **`scenarios/addresses.ts`, `locales.ts`, `products.ts`, `users.ts`, `webhooks.ts`, `wishlist.ts`** — each contributes a `seed*Collection` function (and `locales.ts` additionally provides `driveLocaleEntryEdit`) that populates the corresponding row.

## Notes

- `shopModules` uses `satisfies`, **not** a type annotation, so that `keyof typeof shopModules` yields the six literal keys; `scenarios/check.ts` reads those keys at compile time. An annotation would widen every key to `string`.
- The table deliberately omits orders, payments, shipments, stock movements, reservations, carts, and audit entries — those are *produced* by using the shop (via `flows/shop-history.ts`), not pre-seeded.
- `users` is **not** marked `baseline`; `blank.ts` seeds its own four named accounts via `seedNamedUsersCollection` rather than the full demo set `seedUsersCollection` writes.
- `products` declares `after: ['locales']` because `planTranslations`/`writeTranslations` require the fallback locale to already exist as an ACTIVE row.
- `historyEdits` and `baselineShopModules` both widen `shopModules` to `Record<string, ShopModuleEntry>` before iterating, because the literal per-entry shapes don't uniformly carry `driveHistoryEdit` or `baseline`.
