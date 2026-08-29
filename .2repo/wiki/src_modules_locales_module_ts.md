# src/modules/locales/module.ts

## Purpose

Module registration for the translations/locales feature. Wires the backend-tenant override reader into the i18n infrastructure at import time and declares the module manifest (routes, locale files, seeds, demo shapes) consumed by the kernel. It owns no request-handling logic itself; it is the connective tissue that tells the infrastructure where translations live and how to read runtime overrides.

## Key elements

- **`registerLocaleOverrideProvider(() => localeService.readApiOverrides())`** — Called at import time (a side-effect, not a manifest field). Hands i18n a thunk that reads the backend tenant's override rows. The thunk is invoked on refresh cycles, never on the request path.
- **`export default { … } satisfies AppModule`** — The module manifest object:
  - `name: 'locales'`, `subdomain: 'generic'`, `basePath: '/locales'`
  - `routes: router` (from `./routes`)
  - `locales: path.join(__dirname, 'locales')` — the module's own tier-1 JSON files (used for its own error messages)
  - `seeds: seedLocalesCollection`, `seedExport: exportSeededLocales` (from `./demo`)
  - `demoShapes` — declares both response shapes as `'stored'` (composed, not raw collection rows)

## Relationships

- **`@infrastructure/i18n` (`src/infrastructure/i18n/index.ts`)** — Source of `registerLocaleOverrideProvider`. The i18n layer also loads this module's `locales` directory at boot for tier-1 resolution.
- **`src/kernel/registry.ts`** — Provides the `AppModule` type that the default export satisfies.
- **`src/modules.ts`** — Upward aggregator that collects this module's default export into the app's module list.
- **`./routes`** — Supplies the Express/Hono router mounted at `/locales`.
- **`./services/index.ts`** — Supplies `localeService`, whose `readApiOverrides` is the registered thunk.
- **`./demo.ts`** — Supplies the seed and seed-export functions used in demo/dev mode.

## Notes

- **No `index.ts` barrel.** The file's own docblock states nothing should import this module directly. All i18n access goes through `@infrastructure/i18n`, which sits *below* the module layer. Importing this file from infrastructure would invert the layering rule.
- **Import-time side effect.** `registerLocaleOverrideProvider` runs when the module is first evaluated (i.e., when the app collects its modules), not inside a request handler. It does not touch the database at that point—only the registered thunk does, later on refresh.
- **Two-tier model.** Tier 1 (filesystem JSON) and Tier 2 (database override rows) are deliberately disjoint. A key that exists only in the database is *not* resolvable by `t()`; the files define the keyspace, rows only redefine values.
- **`satisfies AppModule`** rather than `: AppModule`—gives full type-checking while preserving the literal object shape for consumers.
