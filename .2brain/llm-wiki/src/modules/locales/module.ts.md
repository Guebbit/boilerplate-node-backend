---
source: src/modules/locales/module.ts
sha256: 1d4e260b73304c439caaee63664f85ba710f84d0a589e6a43e73d8eb3bee5c8e
generated_at: 2026-10-15T10:43:56.908997+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/module.ts

## Purpose

Module manifest and one-time registration entry point for the **locales** module. It wires the two kernel ports this module owns (locale-override provider and translation port) into the application, injects the `translatables` lookup it builds from all enabled modules, and exports the `AppModule` descriptor (routes, config, local locale files, personal-data classification) that the app tier consumes during boot.

## Key elements

- **`onRegistered(modules)`** – The single lifecycle hook invoked once per process after every enabled module is known. It:
  - Registers the locale-override provider with `@infrastructure/i18n` (a thunk around `localeService.readApiOverrides`).
  - Registers the translation port with `@kernel/translation`, mapping `resolve`, `removeAll`, `search`, `plan`, `write`, and `readAll` to `translationRepository` / `services/translations` implementations.
  - Calls `localeService.setTranslatables(resolveTranslatables(modules))` to give the service its own key-catalogue.

- **`export default { … } satisfies AppModule`** – The module manifest:
  - `name: 'locales'`, `basePath: '/locales'`
  - `routes: router` (from `./routes`)
  - `config: [localesConfig.slice]`
  - `onRegistered` (the hook above)
  - `locales` – path to a module-local `locales/` directory for its own admin-facing error strings (e.g., 409 key-collision messages)
  - `personalData: 'none'` – explicit declaration that no end-customer PII flows through this module

## Relationships

- **`src/kernel/registry.ts`** – Provides the `AppModule` type that the default export satisfies, and the `resolveTranslatables` helper that builds the key-catalogue from all enabled modules.
- **`src/kernel/translation.ts`** – Provides `registerTranslationPort`; this file is the sole implementation of that port.
- **`src/infrastructure/i18n/index.ts`** – Provides `registerLocaleOverrideProvider`; this file is the sole provider of runtime locale overrides.
- **`src/infrastructure/i18n/overrides.ts`** – Consumes the override provider registered here to inject values into `t()` lookups.
- **`src/modules/locales/services/index.ts`** – Supplies `localeService` (override reads, `setTranslatables`).
- **`src/modules/locales/repository.ts`** – Supplies the SQL/data-layer methods (`resolveEntityFields`, `removeEntityTranslations`, `findEntityIdsByFieldMatch`, `findEntityTranslations`) that back the translation port.
- **`src/modules/locales/services/translations.ts`** – Supplies `planForPort` and `writeForPort`, the validation/write half of the translation port.
- **`src/modules/locales/routes.ts`** – Supplies the Express/Fastify `router` exposed at `/locales`.
- **`src/modules/locales/config.ts`** – Supplies the `localesConfig` slice included in the manifest.
- **`src/modules/locales/openapi.yaml`** – OpenAPI spec consumed by `routes.ts`; not directly imported here.
- **`src/modules.ts`** – App-tier aggregator that discovers and calls this module's `onRegistered`; the only external code that may enumerate modules.
- **`tests/integration/conditional-writes.test.ts`**, **`tests/integration/product-write.test.ts`** – Exercise the `plan`/`write` port methods and the `removeAll` path end-to-end.

## Notes

- **Registration is deferred to `onRegistered`, not import-time.** Importing this file (e.g., for a type in a test) has zero side effects; ports are only installed when the app tier actually runs `onRegistered`. This is intentional and load-bearing for test isolation.
- **Two-tier locale design, never merged.** Boot-time files go into i18next; runtime overrides live in the database via this module. Neither tier is awaited on the hot request path—a DB outage degrades to a stale overlay, not a 500.
- **`translatables` is built here, not handed in.** The app tier passes the `modules` array; this module calls `resolveTranslatables` itself, so the lookup always reflects the full enabled set without the app tier needing to know locales' internals.
- **Module-local `locales/` directory** exists solely so this module's own 409/error messages are translatable. Without it, the module that *owns* translations would be the one place where admin-facing errors are stuck in English.
