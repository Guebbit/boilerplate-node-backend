---
source: src/modules.ts
sha256: 342143bd399edd27f7ce68ac3dae89bcf1a541d52fc7d320287e66d72bd0ec20
generated_at: 2026-11-14T18:24:59.196692+00:00
model: ollama:qwen3.8:27b
---

# src/modules.ts

## Purpose

The single module registry for the build: declares which domain modules this server serves and provides the canonical list, name set, directory collector, and compile-time name type that the app tier, docs generators, ops scripts, and test scenarios all consume. It is the one place a developer adds or removes a module (alongside the corresponding folder under `src/modules/`).

## Key elements

- **`enabledModules: AppModule[]`** — the ordered array of every mounted module. Consumed by app boot, route registration, job registration, doc generation, and ops scripts.
- **`servedModuleNames: ReadonlySet<string>`** — the set of module names, built once so the 405 guard and `OPTIONS` handler both read the same membership.
- **`enabledModuleDirectories(kind)`** — returns the flat list of per-module directories for a given manifest field (`'locales'` or `'templates'`), filtering out modules that don't ship one. Used by `bootI18n` and `registerTemplateDirectories`.
- **`ModuleName`** (type) — a hand-maintained string-literal union of every module name, giving compile-time safety instead of a bare `string`. Used by scenario tables to make invalid module references a type error.

## Relationships

- **`src/app/routes.ts`** — iterates `enabledModules` to register routes; reads `servedModuleNames` for the 405 / `OPTIONS` guard.
- **`src/app/jobs.ts`** — walks `enabledModules` to collect and register module jobs.
- **`src/app/boot-rendering.ts`** — calls `enabledModuleDirectories('templates')` to register per-module template directories.
- **`src/app/config.ts`** — reads module-level configuration during boot.
- **`scripts/docs/generate-jobs.ts`**, **`generate-rate-limit-budgets.ts`** — walk `enabledModules` to produce documentation artifacts.
- **`scripts/ops/prepare-job.ts`**, **`run-job.ts`**, **`reapply-erasures.ts`**, **`reencrypt.ts`** — ops scripts that iterate `enabledModules` to apply per-module actions.
- **`scripts/setup/required-keys.ts`** — walks `enabledModules` to validate required configuration keys.
- **`scripts/db/index-sync.ts`** — walks `enabledModules` to sync database indexes.
- **`scenarios/check.ts`** — uses `ModuleName` to key scenario tables, making a typo a compile error.
- **`scripts/scaffold/names.ts`** — scaffolding helper that keeps in sync with the registry when a new module is added.

## Notes

- **Order is alphabetical and purely cosmetic.** Mount order, import resolution, and `subscribe` timing do not depend on array position.
- **Bundlers do not read this list.** Contract-generating bundlers run before `enabledModules` is importable (modules import the generated `@api/` client), so they discover modules from the filesystem (`scripts/contracts/section-order.ts`).
- **`ModuleName` is hand-listed, not derived.** `AppModule.name` is typed `string`, so TypeScript will not narrow a literal union from the array. Adding a module means adding one more member here in addition to the import and the `enabledModules` entry.
- **Adding a module is a multi-file change.** Beyond this file, the conditional lists in `scripts/scaffold/central-edits.ts` must be updated. Removing is `rm -rf` the folder plus deleting all those entries.
- **`example`** is a real entry in the registry, not a placeholder.
