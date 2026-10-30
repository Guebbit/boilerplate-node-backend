---
source: src/modules/locales/module.ts
sha256: 3ce96315508ce52e3bf9a1de583211ef4e5fbdc3d1409bb5327157dbf369f6b5
generated_at: 2026-10-29T04:21:34.042854+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/module.ts

## Purpose

Module registration entry-point for the **locales** feature. Wires the two kernel ports this module owns (the locale-override provider and the translation port) and publishes the module manifest that the kernel consumes during `registerModules`. It is the single file where the locales module's dependencies are connected; all other locales files are pure logic.

## Key elements

- **`onRegistered(modules: readonly AppModule[])`** — One-shot callback invoked by the kernel once every enabled module is known. Calls:
  - `registerLocaleOverrideProvider` (from `@infrastructure/i18n`) with a thunk over `localeService.readLocaleOverlay()`.
  - `registerTranslationPort` (from `@kernel/translation`) supplying `resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`, `canPreviewDrafts`, and `readServed`.
  - `localeService.setTranslatables(resolveTranslatables(modules))` to hand the service the full set of translatable fields.
- **Default export (`AppModule` manifest)** — Declares:
  - `name: 'locales'`
  - `mounts` — mounts the Express router at `/locales`.
  - `config` — exposes the module's Zod config slice.
  - `onRegistered` — the callback above.
  - `locales` — path to the module's own i18n JSON (so its own 409/admin messages are translatable).
  - `personalData` — a single `translationAttribution` section whose `collect` is a no-op (resolves `undefined`) and whose `erase` calls `translationRepository.forgetTranslator`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Provides the `AppModule` type and `resolveTranslatables` used to build the translatable-field lookup. |
| `src/kernel/translation.ts` | Provides `registerTranslationPort`; this file is the sole implementation of that port. |
| `src/infrastructure/i18n/index.ts` | Provides `registerLocaleOverrideProvider`; this file is the sole implementation of the locale-overlay provider. |
| `src/kernel/access/query.ts` | Provides `hasAnonymousReadScope`, used inside `canPreviewDrafts` to decide whether a caller may see draft strings. |
| `src/modules/locales/services/index.ts` | Supplies `localeService` (overlay read, caller scope, translatables setter). |
| `src/modules/locales/services/translations.ts` | Supplies `planForPort` and `writeForPort` used by the translation port's `plan`/`write` slots. |
| `src/modules/locales/repository.ts` | Supplies `translationRepository` for all read/write/erase operations on the translation table. |
| `src/modules/locales/routes.ts` | Supplies the Express `router` mounted at `/locales`. |
| `src/modules/locales/config.ts` | Supplies `localesConfig` (Zod slice) embedded in the manifest. |
| `src/modules.ts` | The kernel loop that calls `onRegistered` for each enabled module, including this one. |
| `tests/integration/erasure.test.ts`, `erased-staff-attribution.test.ts` | Exercise the `personalData.erase` path (`forgetTranslator`) to confirm attribution is removed on account erasure. |
| `tests/integration/product-write.test.ts` | Exercises the `plan`/`write` slots of the translation port during product create/update. |

## Notes

- **Import-time safety:** Ports are registered inside `onRegistered`, not at top-level import. Importing this file for a type or in a test does **not** install ports; only an actual `registerModules` run triggers them.
- **No request-path DB awaits:** Both the deployed-file tier (i18next) and the runtime-override tier are read ahead of time. A database outage at request time only means a stale overlay is served, not a failed request.
- **`collect` is intentionally a no-op:** Translation attribution (`translatedBy`) is staff metadata, not customer data. The section appears in no `POST /account/export` payload. The pointer is forgotten on erasure via `erase`.
- **Self-locale quirk:** The manifest sets `locales` to a local JSON directory so that the one place a 409 key-collision reaches an admin (this module's own error messages) is translatable rather than hardcoded English.
- **`app` tier exception:** Only the app tier may inspect which modules are registered (to collect `translatables`). This module receives the already-resolved result via `resolveTranslatables(modules)` rather than querying the registry itself.
