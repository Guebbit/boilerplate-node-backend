---
source: src/modules.ts
sha256: 6431fbb37a7fd1a8c0a246a87fed6a06a8f64dc73feb5f18526d2084cee0ab13
generated_at: 2026-10-29T02:21:44.321360+00:00
model: ollama:qwen3.8:27b
---

# src/modules.ts

## Purpose

The single registry that declares which domain modules this build serves. Every consumer that needs to know "what modules exist" (the app tier, docs generators, ops scripts, test scenarios) walks the list exported here. It exists so that adding or removing a module is a bounded, visible edit rather than a scattered convention.

## Key elements

- **`enabledModules: AppModule[]`** — The canonical array of all 27 module instances (access, account, …, wishlist). Ordered alphabetically for diff readability; mount order, import resolution, and `subscribe` timing are independent of array order.
- **`enabledModuleDirectories(kind)`** — Collects one optional per-module directory field (`'locales'` or `'templates'`) into a flat `string[]`, skipping modules that don't ship one. Used by `bootI18n` and `registerTemplateDirectories`.
- **`ModuleName`** — A hand-written string-literal union of every module's name. Used as a type constraint so that referencing a module not mounted in this build is a compile error. Deliberately not derived from `enabledModules` because `AppModule.name` is typed `string`, which would widen any literal back.

## Relationships

- **`src/app.ts`, `src/app/routes.ts`, `src/app/jobs.ts`, `src/app/security.ts`, `src/app/workers.ts`, `src/app/config.ts`** — The app tier imports `enabledModules` to wire up per-module routes, jobs, security policies, workers, and config at boot.
- **`scripts/docs/generate-jobs.ts`, `scripts/docs/generate-rate-limit-budgets.ts`** — Docs generators walk `enabledModules` to discover per-module artifacts.
- **`scripts/ops/reencrypt.ts`, `scripts/ops/run-job.ts`, `scripts/db/index-sync.ts`** — Ops and DB scripts iterate the registry to operate on every mounted module.
- **`scripts/setup/required-keys.ts`** — Walks modules to collect required environment keys.
- **`scenarios/check.ts`** — Consumes `ModuleName` (via `scenarios/index.ts`'s `shopModules`) to type-check scenario names against the build.
- **`scripts/scaffold/names.ts`** — Uses `ModuleName` (and the registry) to scaffold new module folders with correct names.
- **`scripts/contracts/private-no-cache-routes.ts`** — Contract bundlers do **not** read `enabledModules`; they discover modules from disk (`scripts/contracts/section-order.ts`) because they run before the generated `@api/` client (which each module imports) exists.

## Notes

- **Adding a module is a multi-site edit:** create `src/modules/<name>/module`, then add the import, the `enabledModules` entry, the `ModuleName` member, *and* the conditional lists in `scripts/scaffold/central-edits.ts`. Missing any one is a real coupling break, not a warning.
- **`ModuleName` must stay in sync manually.** There is no `typeof` expression that can recover the literal from `AppModule.name: string`. The alphabetical order here mirrors `enabledModules` purely to keep diffs boring.
- **Order in `enabledModules` is cosmetic.** Nothing (mounting, import resolution, `subscribe` timing) depends on it; do not reorder to change behavior.
- **Contract bundlers are decoupled from this file on purpose.** If a new module must be visible to contract generation, register it in `scripts/contracts/section-order.ts` (disk-based discovery), not here.
