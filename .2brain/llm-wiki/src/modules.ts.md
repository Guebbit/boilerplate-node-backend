---
source: src/modules.ts
source_sha256: e639c2442fdc78427488f40a4faf25426c810c615aaf79b856316a8c58f4c14e
context_sha256: 07a3bc4b2994e7515f0df41640f0a9c80053dccd11660432390546ac5fd4d8c4
generated_at: 2026-11-22T03:15:23.512106+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules.ts

## Purpose
The single registry of which domain modules this build serves. It imports each module's manifest from `src/modules/<name>/module`, exposes them as one list, and derives lookup helpers from it. The app tier, docs generators and ops scripts all walk this list.

## Key elements
- `enabledModules: AppModule[]` — every module the build serves, alphabetical (28 entries, including `example`).
- `servedModuleNames: ReadonlySet<string>` — names of the mounted modules, built once. It decides whether a contract path is one this server can answer (the 405 guard and the `OPTIONS` answer).
- `enabledModuleDirectories(kind: 'locales' | 'templates'): string[]` — collects each module's own `locales` or `templates` directory, skipping modules that ship none. The consumers are `bootI18n` for locales and `registerTemplateDirectories` (`mailer.ts`) for templates.
- `ModuleName` — a hand-written string-literal union of all module names, so module tables can be keyed on it and naming an unmounted module is a compile error (for example `shopModules` in `scenarios/index.ts`).

## Relationships
The listed neighbors depend on this file. It imports only `AppModule` from `@kernel/registry` and the per-module `module` files.
- `src/app.ts`, `src/app/routes.ts`, `src/app/jobs.ts`, `src/app/config.ts` and `src/app/boot-rendering.ts` are the app tier that consumes the registry. Boot-time locale and template registration goes through `enabledModuleDirectories`.
- `scripts/docs/generate-jobs.ts`, `scripts/docs/generate-rate-limit-budgets.ts`, `scripts/ops/*` (`prepare-job`, `run-job`, `reapply-erasures`, `reencrypt`), `scripts/db/index-sync.ts`, `scripts/setup/required-keys.ts`, `scripts/scaffold/names.ts` and `scenarios/check.ts` are listed as graph neighbors. The file's own header says docs and scripts walk the registry.
- The contract bundlers do not read this file. They run before `enabledModules` can be imported, because the modules import the generated `@api/` client. They discover modules from disk instead.

## Notes
- Adding a module takes three edits here: the import, the `enabledModules` entry and the `ModuleName` member. It also takes the conditional lists in `scripts/scaffold/central-edits.ts`. Removing one means `rm -rf` of the folder plus deleting those edits.
- Alphabetical order is only to keep diffs boring. Import resolution and `subscribe` timing don't depend on it.
- Mount order matters in one place: `inventory` must come before `products`, so `GET /products/availability` isn't matched as `GET /products/{id}` (`src/modules/inventory/availability-routes.ts`). Alphabetical order already gives this.
- `ModuleName` can't be derived from `enabledModules`, because `AppModule.name` is typed `string` and the literal can't be recovered. Keep it in sync with the array by hand.
