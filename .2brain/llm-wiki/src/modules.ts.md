---
source: src/modules.ts
sha256: dddd4ecfe08641c9b64e0747fd0180aba721e8599fe8c8e163c5f745d68c457b
generated_at: 2026-09-27T14:20:34.958528+00:00
model: ollama:qwen3.8:27b
---

# src/modules.ts

## Purpose

The single registry of every domain module this build serves. It is the one list the app tier, docs generators, ops scripts, and scenario checks all walk to discover which modules exist. Adding or removing a module is a folder under `src/modules/` plus (or minus) one line here.

## Key elements

- **`enabledModules: AppModule[]`** — The canonical array of all mounted modules (18 in this build), alphabetically ordered. Consumed by the app tier for mounting/routing/workers and by scripts for docs and ops sweeps.
- **`enabledModuleLocales(): string[]`** — Derives the flat list of locale directories from `enabledModules` (filtering out modules that ship none) for `bootI18n` to register translations.
- **`ModuleName`** (type) — A hand-listed string-literal union of every module name. Lets downstream code (e.g. `scenarios/index.ts`'s `shopModules`) key on a named module and get a compile error if it references one this build doesn't mount.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type that `enabledModules` is typed against.
- **`src/modules/{access,account,addresses}/module.ts`** (and the other 15 module files) — Each is imported and placed into `enabledModules`; this file is their sole registration point.
- **`src/app.ts`, `src/app/routes.ts`, `src/app/security.ts`, `src/app/workers.ts`** — The app tier walks `enabledModules` to mount routes, apply security middleware, and start per-module workers.
- **`scenarios/check.ts`** — Consumes `ModuleName` (via `scenarios/index.ts`) to type-check that referenced modules are actually mounted.
- **`scripts/db/index-sync.ts`, `scripts/docs/generate-rate-limit-budgets.ts`, `scripts/ops/reap-inactive-accounts.ts`, `scripts/ops/sweep-order-effects.ts`, `scripts/ops/sweep-reservations.ts`, `scripts/setup/required-keys.ts`** — Ops/setup/docs scripts iterate `enabledModules` to act on every mounted domain.

## Notes

- **Order is cosmetic.** Alphabetical only; mount order, import resolution, and `subscribe` timing do not depend on array position.
- **`ModuleName` is deliberately hand-listed**, not derived from `enabledModules`. `AppModule.name` is typed `string`, so a computed union would widen every literal back to `string`; there is no `typeof` expression to claw the literal back. Keeping it in sync with `enabledModules` is the operator's responsibility.
- **OpenAPI bundling is decoupled.** A module that ships its own `openapi.yaml` also needs a line in `MODULE_SECTIONS` (`scripts/contracts/openapi-bundle.ts`). The bundler reads those files from disk and runs before `enabledModules` is importable (the modules import a generated `@api/` client the bundler produces). Compliance is checked by `tests/cross-cutting/contract-bundles.test.ts`, not at import time.
- **Removing a module is a two-step operation:** `rm -rf` the folder *and* delete its line here (and its `ModuleName` literal). Any residual reference that remains after both steps is a real coupling worth surfacing.
