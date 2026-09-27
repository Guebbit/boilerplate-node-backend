---
source: src/modules/locales/module.ts
sha256: 189ae8ddcf1ba34935e2a1ec229e502af6416958785eff936721d9f69e8bb76f
generated_at: 2026-09-27T14:59:36.423016+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/module.ts

## Purpose

Module manifest and boot-time wiring for the **locales** module. It declares the module's identity (name, base path, routes, permissions, locale files, personal-data level) and defines the single `onRegistered` callback that the kernel invokes once all enabled modules are known. That callback is where the module's two kernel ports (locale-override provider and translation port) are actually installed.

## Key elements

- **`onRegistered(modules)`** — the only function in the file. Called by the kernel's module-registration pass. Performs three registrations:
  1. `registerLocaleOverrideProvider` — hands `localeService.readApiOverrides()` to `@infrastructure/i18n` so admin-entered overrides reach `t()`.
  2. `registerTranslationPort` — binds six methods (`resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`) from `translationRepository` and `services/translations.ts` to the kernel translation port consumed by read-path decorators, hard-deletes, free-text search, and entity-write flows.
  3. `localeService.setTranslatables(resolveTranslatables(modules))` — builds the translatable-key lookup from the full enabled-module list and stores it on the service.
- **`export default` (satisfies `AppModule`)** — the manifest object: `name: 'locales'`, `basePath: '/locales'`, `permissions` (five `locales.*` keys), `routes` (from `./routes`), `onRegistered`, `locales` (directory of the module's own `.json` locale files), and `personalData: 'none'`.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type and `resolveTranslatables()` helper used in `onRegistered`.
- **`src/kernel/translation.ts`** — provides `registerTranslationPort()`, the sink for the six-method port object.
- **`src/infrastructure/i18n/index.ts`** — provides `registerLocaleOverrideProvider()`, the sink for the override supplier.
- **`src/modules/locales/repository.ts`** — source of `translationRepository` whose methods back `resolve`, `removeAll`, `search`, and `readAll`.
- **`src/modules/locales/services/translations.ts`** — source of `planForPort` and `writeForPort` (validation + application of the translation half of an entity write).
- **`src/modules/locales/services/index.ts`** — source of `localeService` (override reader, `setTranslatables` target).
- **`src/modules/locales/routes.ts`** — provides the `router` exposed as the module's HTTP surface.
- **`src/modules.ts`** — the top-level module list that includes this module's manifest; triggers `onRegistered` during boot.
- **`tests/integration/product-write.test.ts`** — exercises the translation port's `plan`/`write` path via a product write, confirming the wiring end-to-end.

## Notes

- Ports are registered inside `onRegistered`, **not** at import time. Importing this file (e.g. for a type) has no side effects; only a real `registerModules` call triggers the registrations.
- The `translations.any.*` permission keys are intentionally **absent** from this module's `permissions` array — they belong to `core` because the translation port they guard outlives the locales module.
- `locales` in the manifest is a path to the module's *own* locale JSON files (for its error messages), distinct from the tenant/runtime override rows managed through the service.
- `personalData` is hard-coded to `'none'`; `translatedBy` is a staff user-id pointer, not end-customer data, so no GDPR export path applies.
