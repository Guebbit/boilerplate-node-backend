---
source: src/modules/locales/module.ts
source_sha256: b55e55397d0e58ca9a5d756ec90c1bf6048c07f31233bc2f7220a3fe4007546a
context_sha256: 5e507b2d13a6c39530953a3ce2d033b331ac123c1be874c1e6fa8e2ea321fa47
generated_at: 2026-11-22T05:45:26.499375+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/module.ts

## Purpose
Manifest entry for the `locales` module. It declares the module's routes, config slice, own locale files and personal-data handling. Its `onRegistered` hook installs the module's two kernel ports and wires up its `translatables` lookup. Per the file's doc comment, the module covers which languages a deployment speaks and the dictionaries a client downloads. Deployed files and runtime overrides stay as separate tiers, and neither is awaited on the request path.

## Key elements
- **`onRegistered(modules)`** runs once all enabled modules are known. It does three things:
  - Calls `registerLocaleOverrideProvider(() => localeService.readLocaleOverlay())`. This feeds runtime overrides and language on/off state to `@infrastructure/i18n`.
  - Calls `registerTranslationPort({...})`, backed by `translationRepository`, `planForPort` and `writeForPort`:
    - `resolve`, `removeAll`, `search`, `plan`, `write`, `readAll` and `readServed`.
    - `canPreviewDrafts`, which is `!hasAnonymousReadScope(localeService.callerScope, caller)`.
  - Calls `localeService.setTranslatables(resolveTranslatables(modules))`.
- **Default export** is the manifest, typed with `satisfies AppModule`:
  - `name: 'locales'`.
  - `mounts`: the `router` at `/locales`.
  - `config`: `[localesConfig.slice]`.
  - `onRegistered`.
  - `locales`: the `locales` directory next to the file, so the module's own error messages are translated.
  - `personalData`: one entry, section `translationAttribution`.

## Relationships
- `src/kernel/registry.ts`: provides the `AppModule` type and `resolveTranslatables`.
- `src/kernel/translation.ts`: provides `registerTranslationPort`, the port this file implements.
- `src/infrastructure/i18n/index.ts` (`@infrastructure/i18n`): receives the override provider through `registerLocaleOverrideProvider`. The doc comment says the rest of the codebase reaches i18n through this package, not through the module's own index.
- `src/kernel/access/query.ts`: provides `hasAnonymousReadScope`, used for draft preview.
- `src/modules/locales/routes.ts`: supplies the `router` that is mounted.
- `src/modules/locales/services/index.ts`: supplies `localeService`.
- `src/modules/locales/services/translations.ts`: supplies `planForPort` and `writeForPort`.
- `src/modules/locales/repository.ts`: supplies `translationRepository`, which backs most port methods and `forgetTranslator`.
- `src/modules/locales/config.ts`: supplies `localesConfig`, whose `slice` is listed under `config`.
- `src/modules.ts`: the doc comment says the `app` tier is the only one that sees which modules exist.
- The integration tests `erasure`, `erased-staff-attribution` and `product-write` are neighbors in the graph.

## Notes
- Ports are registered in `onRegistered`, not at import time. Importing this file, for a type or in a test, installs nothing.
- `translatedBy` is the caller's user id, stored as a pointer. The `translationAttribution` personal-data section has `collect` resolving `undefined`, so it appears in no export. Its `erase` calls `translationRepository.forgetTranslator(userId, session)`.
- The `readAll` and `readServed` callbacks both convert repository rows into a `Map` of locale to fields.
- A comment says the override provider "touches no database", because `readLocaleOverlay` only runs on the refresh.
