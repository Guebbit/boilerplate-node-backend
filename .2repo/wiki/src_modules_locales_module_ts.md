# src/modules/locales/module.ts

## Purpose

Module manifest and import-time bootstrap for the **locales** module. It registers the runtime locale-override provider with `@infrastructure/i18n` and declares the module's routes, i18n resource path, seeding hooks, and demo shape metadata in a single `AppModule` object. The file exists so that `src/modules.ts` can collect it and the i18n layer can call back for overrides, without any module needing to import this file directly.

## Key elements

- **`registerLocaleOverrideProvider(() => localeService.readApiOverrides())`** — Executed at import time (not via a manifest field). Wires the backend tenant's override rows into `@infrastructure/i18n` so admin-typed overrides flow into `t()`. The factory is lazy; it only touches the database on refresh, not per-request.
- **`export default { … } satisfies AppModule`** — The manifest entry consumed by the kernel. Exposes `name`, `basePath` (`/locales`), `routes`, `locales` (path to the module's own i18n JSON), `seeds`, `seedExport`, and `demoShapes`.
- **`demoShapes`** — Marks `locales` and `localeMessages` endpoints as `'stored'`, meaning their responses are composed (capabilities envelope / nested tree) rather than raw collection rows.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Source of `registerLocaleOverrideProvider`; the sole consumer of the provider this file registers.
- **`src/infrastructure/i18n/overrides.ts`** — Houses the override-provider registry and refresh mechanism that the registered factory feeds.
- **`src/kernel/registry.ts`** — Provides the `AppModule` type used in the `satisfies` constraint.
- **`src/modules.ts`** — Collects this default export alongside other module manifests to build the application's route/seed table.
- **`src/modules/locales/routes.ts`** — Supplies `router`, attached to the manifest's `routes` field.
- **`src/modules/locales/services/index.ts`** — Supplies `localeService`; its `readApiOverrides` method is the body of the registered provider.
- **`src/modules/locales/demo.ts`** — Supplies `seedLocalesCollection` and `exportSeededLocales` for the `seeds` / `seedExport` manifest fields.

## Notes

- **No `index.ts`.** The file's doc-comment is explicit: nothing imports this module, and nothing should. All i18n access goes through `@infrastructure/i18n`; the module manifest is consumed only by `src/modules.ts` at boot.
- **Two-tier separation.** Deployed locale files (loaded into i18next at boot) and runtime overrides (owned by this module, one row per language/tenant/key) are intentionally disjoint. Neither is awaited on the request path, so a database outage degrades gracefully to a stale overlay.
- **Import-time registration is deliberate.** The override provider is registered as a top-level side-effect (same pattern as `audit-logs` installing its sink) rather than as a manifest field, because the field is only ever filled by one module and putting it in the manifest would force `app.ts` to locate it.
- **Self-translation.** The `locales` field points at the module's own i18n directory so its error messages (e.g., a 409 key-collision) respect the admin's requested language rather than defaulting to English.
