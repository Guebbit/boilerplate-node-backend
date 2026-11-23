---
source: scenarios/blank.ts
source_sha256: 7dfe5d6c04bfa664b7222c246e48f6f76959d0b115b54f16dc8b5fdf422e48d6
context_sha256: e09982fa171ff393f586c0772531c6d981aa62148cd0dd66e4d033754b181182
generated_at: 2026-11-22T01:41:50.410043+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/blank.ts

## Purpose
Defines the `blank` scenario: harness infrastructure only (the access model, the named accounts, and the fallback locale that a product created by a spec still needs active). It has no catalogue, orders, or carts. Behaviour e2e specs that create what they assert restore into this scenario instead of `shop`.

## Key elements
- `seedBlank(): Promise<SeedOutcome[]>` is the only export. It seeds the scenario and returns a flat list of `SeedOutcome`s.
  1. Runs `seedAccessModel()` first (roles and shop membership).
  2. Then runs two things concurrently with `Promise.all`:
     - `seedNamedUsersCollection()`, which seeds the named accounts.
     - `runInWaves(asWaveEntries(baselineShopModules()))`, which seeds every shop module marked `baseline` (`locales`, today).
  3. Combines the results into `[...users, ...baseline.flat()]`.

## Relationships
- `./accounts`: provides `seedAccessModel`, which must finish before anything else because nothing can resolve a caller until a shop exists to be a member of.
- `./users`: provides `seedNamedUsersCollection` for the named accounts.
- `./shop-modules`: provides `baselineShopModules` and `asWaveEntries`. Reading the baseline set from here keeps `blank` in step with `shop` without either scenario importing the other.
- `./waves`: provides `runInWaves`, which executes the baseline module entries.
- `@scenarios/seed`: supplies the `SeedOutcome` type (type-only import).
- `scenarios/index.ts`: reads `seedBlank` through its `SCENARIOS` registry.

## Notes
- `seedBlank` is never called directly. Go through the `SCENARIOS` registry.
- The users and baseline modules are seeded concurrently because neither reads the other's write.
- Do not hand-list baseline modules here. Mark them `baseline` in `shop-modules.ts` instead.
