---
source: scenarios/blank.ts
sha256: 44d5d9e501873fcda4e917d42db3f97c208939358f5261f63ccefb2dedb0161e
generated_at: 2026-09-27T13:49:18.118231+00:00
model: ollama:qwen3.8:27b
---

# scenarios/blank.ts

## Purpose

The `blank` scenario seeds the minimum harness infrastructure — the access model, four named accounts, and the baseline locale module — without any catalogue, orders, or carts. It exists as a lightweight starting state for behaviour e2e specs that create and assert on their own entities, so they restore into `blank` rather than the heavier `shop` scenario.

## Key elements

- **`seedBlank()`** — The sole export. A `Promise<SeedOutcome[]>` that:
  1. Calls `seedAccessModel()` (roles + shop membership) first, since nothing can resolve a caller before a shop exists.
  2. Then runs `seedNamedUsersCollection()` and `runInWaves(asWaveEntries(baselineShopModules()))` **concurrently** via `Promise.all` — neither reads the other's write.
  3. Flattens and returns the combined seed outcomes.
- **`baselineShopModules()`** (imported from `shop-modules.ts`) — Supplies the set of modules marked `baseline` (currently just `locales`). Reading it from `shop-modules.ts` rather than hardcoding keeps `blank` in step with `shop` without a cross-scenario import.

## Relationships

- **`scenarios/index.ts`** — Registers `seedBlank` in the `SCENARIOS` map; this file is never called directly by specs.
- **`scenarios/accounts.ts`** — Provides `seedAccessModel`, called as the first sequential step.
- **`scenarios/users.ts`** — Provides `seedNamedUsersCollection`, called concurrently with the baseline modules.
- **`scenarios/shop-modules.ts`** — Provides `asWaveEntries` and `baselineShopModules`, the shared helper that defines which modules are "baseline."
- **`scenarios/waves.ts`** — Provides `runInWaves`, the wave-execution utility for applying seed entries.
- **`scenarios/seed.ts`** — Supplies the `SeedOutcome` type used as the return type of `seedBlank`.

## Notes

- The file is a `@module` with no default export; consumers access `seedBlank` by named import.
- The concurrency between `seedNamedUsersCollection` and the baseline modules is intentional and safe because they write to disjoint resources. Adding a baseline module that depends on named users would break this assumption.
- `blank` deliberately omits anything "shop-shaped" (catalogue, orders, carts). If a spec needs those, it should restore into `shop` instead.
