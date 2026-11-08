---
source: scenarios/blank.ts
sha256: 7dfe5d6c04bfa664b7222c246e48f6f76959d0b115b54f16dc8b5fdf422e48d6
generated_at: 2026-11-08T02:27:49.132369+00:00
model: ollama:qwen3.8:27b
---

# scenarios/blank.ts

## Purpose

Seeds the minimal harness infrastructure (access model, named accounts, baseline shop modules such as `locales`) with no shop-specific data — no catalogue, orders, or carts. It exists as the restore target for behaviour e2e specs that create their own fixtures, giving them a clean slate that is lighter than restoring into `shop`.

## Key elements

- **`seedBlank`** (exported) — The sole export. Runs `seedAccessModel` sequentially, then seeds `seedNamedUsersCollection` and `runInWaves(asWaveEntries(baselineShopModules()))` concurrently. Returns a flattened `Promise<SeedOutcome[]>`.

## Relationships

- **`scenarios/index.ts`** — Registers `seedBlank` in the `SCENARIOS` map; this file is never imported directly by specs.
- **`scenarios/seed.ts`** — Supplies the `SeedOutcome` type used as the return type.
- **`scenarios/accounts.ts`** — Provides `seedAccessModel`, called first because no caller can resolve a shop membership until a shop exists.
- **`scenarios/users.ts`** — Provides `seedNamedUsersCollection`, run in the parallel phase after the access model is ready.
- **`scenarios/shop-modules.ts`** — Provides `baselineShopModules()` (the list of modules marked `baseline`) and `asWaveEntries()`; keeps `blank` in step with `shop` without either importing the other's scenario.
- **`scenarios/waves.ts`** — Provides `runInWaves` to execute the baseline modules in dependency-ordered waves.

## Notes

- Ordering is deliberate: access model must complete before the parallel phase, but the two parallel tasks (`users` and `baseline`) are safe to run concurrently because neither reads the other's write.
- `blank` deliberately pulls its baseline list from `shop-modules.ts` rather than hardcoding it, so adding a new `baseline` module there automatically includes it in `blank` without touching this file.
- E2e specs restore into `blank` (not `shop`) when they create their own fixtures and assert against them.
