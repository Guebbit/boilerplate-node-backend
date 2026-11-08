---
source: src/modules/locales/module.ts
sha256: 3ce96315508ce52e3bf9a1de583211ef4e5fbdc3d1409bb5327157dbf369f6b5
generated_at: 2026-11-08T06:23:29.776789+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/module.ts

## Purpose

Module manifest and bootstrap wiring for the **locales** module. Declares the module's identity (name, routes, config, i18n files, personal-data hooks) and defines the `onRegistered` callback that installs two kernel ports — a locale-override provider and a translation port — only when the module is actually registered, not at import time.

## Key elements

- **`onRegistered(modules)`** — Called by the registry once all enabled modules are known. Performs three installations:
  - `registerLocaleOverrideProvider(() => localeService.readLocaleOverlay())` — hands a lazy override reader to `@infrastructure/i18n`.
  - `registerTranslationPort({…})` — wires the module's translation implementation to the kernel port (see below).
  - `localeService.setTranslatables(resolveTranslatables(modules))` — gives the service the per-module translatable-key list it cannot collect on its own.
- **Translation port object** — The concrete implementation registered via `registerTranslationPort`. Methods: `resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`, `canPreviewDrafts`, `readServed`. All delegate to `translationRepository` or `planForPort`/`writeForPort`.
- **`export default` (AppModule manifest)** — Exports `name: 'locales'`, `mounts` (router at `/locales`), `config` (`localesConfig.slice`), `onRegistered`, `locales` (path to the module's own i18n JSON), and `personalData`.
- **`personalData`** — Single section `translationAttribution`. `collect` always resolves `undefined` (nothing is exported to the subject); `erase` calls `translationRepository.forgetTranslator(userId, session)` to clear the `translatedBy` pointer on a staff-account deletion.

## Relationships

- **`@infrastructure/i18n`** — Consumes `registerLocaleOverrideProvider`; this module is the *only* provider of the runtime override layer.
- **`@kernel/translation`** — Consumes `registerTranslationPort`; after registration, all other modules reach translation through this port rather than importing this module directly.
- **`@kernel/registry`** — Imports `AppModule` type and `resolveTranslatables` to build the translatables map from the full module list.
- **`@kernel/access/query`** — Imports `hasAnonymousReadScope` to implement the `canPreviewDrafts` predicate on the translation port.
- **`./routes`** — Mounts the HTTP router at `/locales`.
- **`./services`** (`localeService`) — Source of `readLocaleOverlay` and the target of `setTranslatables`.
- **`./repository`** (`translationRepository`) — Backing store for every port method (`resolveEntityFields`, `removeEntityTranslations`, `findEntityIdsByFieldMatch`, `findEntityTranslations`, `findServedEntityTranslations`, `forgetTranslator`).
- **`./services/translations`** — Provides `planForPort` / `writeForPort` used by the port's `plan` and `write` methods.
- **`./config`** — Supplies the module's config slice included in the manifest.
- **`src/notifications/module.ts`** — Peer module; likely a consumer of the translation port registered here.
- **`tests/integration/erasure.test.ts`, `tests/integration/erased-staff-attribution.test.ts`** — Exercise the `personalData.erase` path (`forgetTranslator`) in integration scenarios.

## Notes

- Ports are registered inside `onRegistered`, **not** at import time. Importing this file (for a type, a test helper, etc.) has no side-effects; only a `registerModules` call that includes this module triggers installation.
- The `canPreviewDrafts` predicate inverts the anonymous-read check: a caller *without* anonymous read scope (i.e., authenticated staff) can preview draft translations.
- The module ships its **own** i18n directory (`locales/`) so that its error messages (e.g., the 409 on key collision) are themselves localisable — it does not rely on another module's strings for this.
- `personalData.collect` is intentionally a no-op; `translatedBy` is a staff-id pointer, not customer PII, so it is excluded from account exports by design.
