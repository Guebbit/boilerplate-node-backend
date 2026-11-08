---
source: scenarios/shop-modules.ts
sha256: 28f97d394cef6f88fa2901fb00697de9fa397568fd9cd4b64882fdc4802c153d
generated_at: 2026-11-08T02:32:05.277430+00:00
model: ollama:qwen3.8:27b
---

# scenarios/shop-modules.ts

## Purpose

Defines the per-module fixture table for the `shop` scenario — which modules are seeded, in what order, and which ones `blank` also needs. It lives in its own file (rather than inside `scenarios/index.ts`) so that `blank.ts` can read the same entries without `index.ts` and `blank.ts` importing each other.

## Key elements

- **`ShopModuleEntry` (interface)** — Shape of one table row: a `seed` function, optional `after` dependency names, a `baseline` flag (also seeded by `blank`), and an optional `driveHistoryEdit` callback that contributes a demo-history step.
- **`shopModules` (const)** — The full table, sourced from `./shop-modules.generated` (auto-collected from each `scenarios/<module>.ts`). Typed with `satisfies Record<string, ShopModuleEntry>` so literal keys are preserved for compile-time checks in `check.ts`.
- **`asWaveEntries` (function)** — Adapts a `ShopModuleEntry` table (or a subset) into the `WaveEntry` shape that `./waves`'s scheduling functions (`runInWaves`, `waveOrder`) consume.
- **`historyEdits` (function)** — Returns all `driveHistoryEdit` callbacks in table order; dropping a module's entry automatically drops its history step.
- **`baselineShopModules` (function)** — Filters `shopModules` down to entries with `baseline: true`, giving `blank.ts` its shared subset without duplicating fixture code.

## Relationships

- **`scenarios/waves.ts`** — Provides the `WaveEntry` type; `asWaveEntries` reshapes the table into that format so `waves.ts` can schedule seeding without knowing the shop-specific shape.
- **`scenarios/flows/client.ts`** — Provides the `Caller` type used as the parameter of `driveHistoryEdit`.
- **`scenarios/seed.ts`** — Provides the `SeedOutcome` return type for every `seed` function.
- **`scenarios/index.ts`** — Consumes `shopModules` (via `asWaveEntries` and `historyEdits`) to build the `shop` scenario; the module doc explicitly states `index.ts` builds both `blank` and `shop` from these entries.
- **`scenarios/blank.ts`** — Calls `baselineShopModules` (via `asWaveEntries`) to get the subset of entries it shares with `shop`, avoiding a circular import with `index.ts`.
- **`scenarios/shop-modules.generated`** — Supplies the `shopModuleFixtures` object that `shopModules` wraps; adding or deleting a `scenarios/<module>.ts` file adds or removes a row here.

## Notes

- `satisfies` (not a type annotation) is deliberate: an annotation would widen every key to `string`, breaking `check.ts`'s `keyof typeof shopModules` assertions.
- `after` names that are absent from the table are silently ignored, so an entry survives the deletion of the module it waited for — no cascade required.
- `baseline` currently applies only to `locales`. `users` is explicitly **not** baseline: `blank` seeds 13 named accounts via its own `seedNamedUsersCollection`, not the full demo user set this entry's `seed` writes.
- Entries are never hand-listed in this file; the generated file is the single source of truth. Removing a `scenarios/<module>.ts` file removes its row automatically.
