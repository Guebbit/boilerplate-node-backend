---
source: src/modules.ts
sha256: 28cd331530cf288b35d6cde18b9e7165cf241e168b00ede3920920f150294eaa
generated_at: 2026-11-08T03:55:52.209593+00:00
model: ollama:qwen3.8:27b
---

# src/modules.ts

## Purpose

The build's module registry. It declares which domain modules this application serves by importing each module's default export and placing them in a single, ordered array. Both the runtime app tier and the build/ops scripts walk this one list to discover modules, mount routes, register jobs, and collect per-module resources. It exists so that adding or removing a domain is a finite, visible set of edits rather than scattered discoveries.

## Key elements

- **`enabledModules: AppModule[]`** — The canonical array of every mounted module (access, account, … wishlist). Consumers (app routing, job registration, docs generation, ops scripts) iterate this to act on each module.
- **`enabledModuleDirectories(kind: 'locales' | 'templates'): string[]`** — Collects a single manifest field from every module that ships one, filtering out `undefined`. Used by `bootI18n` (locales) and `registerTemplateDirectories` in `mailer.ts` (templates).
- **`ModuleName`** (type) — A hand-written string-literal union of every module's `name`. Gives compile-time safety when code needs to reference a module by name (e.g. `scenarios/check.ts`'s `shopModules`) instead of using a bare `string`.

## Relationships

- **`src/app/routes.ts`, `src/app/jobs.ts`, `src/app/security.ts`, `src/app/config.ts`, `src/app.ts`** — The app tier imports `enabledModules` to mount routes, register jobs, apply security middleware, and build configuration for each domain.
- **`scripts/ops/run-job.ts`, `scripts/ops/prepare-job.ts`, `scripts/ops/reencrypt.ts`, `scripts/ops/reapply-erasures.ts`** — Ops scripts walk `enabledModules` to iterate over each module's job definitions or data for bulk operations.
- **`scripts/docs/generate-jobs.ts`, `scripts/docs/generate-rate-limit-budgets.ts`** — Documentation generators iterate the registry to emit per-module docs.
- **`scripts/db/index-sync.ts`** — DB synchronization walks modules to collect their index definitions.
- **`scripts/setup/required-keys.ts`** — Setup script checks each module for required env keys.
- **`scripts/scaffold/names.ts`** — Scaffold tooling that must stay in sync with the module list when generating new modules.
- **`scenarios/check.ts`** — Uses the `ModuleName` type to constrain which modules a scenario may reference, producing a compile error (not a runtime failure) if a non-mounted name is used.

## Notes

- **Adding a module is multi-file.** Besides the import + array entry + `ModuleName` member here, conditional lists in `scripts/scaffold/central-edits.ts` must also be updated. The coupling is intentional (`docs/theory/module-lifecycle.md`).
- **`ModuleName` is hand-listed, not derived.** `AppModule.name` is typed as `string`, so TypeScript widens the literal in the array; there is no `typeof` expression that recovers the literal. The list must be maintained in parallel with `enabledModules`.
- **Order is purely alphabetical.** Mount order, import resolution, and `subscribe` timing do not depend on array position; the convention exists to keep diffs stable.
- **Bundlers do not read this file.** They run before `enabledModules` is importable (modules import the generated `@api/` client the bundler itself produces) and instead discover modules from disk (`scripts/contracts/section-order.ts`).
