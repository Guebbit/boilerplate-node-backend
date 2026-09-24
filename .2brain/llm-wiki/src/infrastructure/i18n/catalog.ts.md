---
source: src/infrastructure/i18n/catalog.ts
sha256: 13c6a15e1f371bb86bd2ca54640627d456e29dd2c5fd497c074f9620f9267592
generated_at: 2026-09-23T17:46:47.635488+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/catalog.ts

## Purpose

Single source of truth for where translation dictionaries come from and how they are assembled. It discovers supported locales (env var or directory listing), deep-merges the shared dictionary with each registered module's contribution, and produces the `Resource` object handed to `i18next.init()` at boot. A project that relocates its dictionaries edits only this file.

## Key elements

- **`LOCALES_DIRECTORY`** – Resolved relative to `__dirname` (→ `src/locales/`), independent of `process.cwd()`, so the same path works under a cluster entry point, a Jest worker, or a migration.
- **`getDefaultLocale()` / `getFallbackLocale()`** – Lazy readers for `NODE_DEFAULT_LOCALE` and `NODE_FALLBACK_LOCALE` (both default to `'en'`). Read at call-time so tests can mutate `process.env` after import.
- **`localeCandidatesFor(locale)`** – Pure helper that builds the resolution chain `[exact, base, fallback]`, deduplicated. Deliberately kept here (not in `kernel/translation.ts`) because it is stateless with no module to answer.
- **`listSupportedLocales()`** – Memoised: returns `NODE_SUPPORTED_LOCALES` (comma-separated) if set, otherwise the sorted `.json` filenames in `LOCALES_DIRECTORY`. Cached after first call because `i18next.init()` reads it once.
- **`resetSupportedLocales()`** – Clears the memoisation cache; intended for tests that change the env var between runs.
- **`registerLocaleDirectories(directories)`** – Replacement setter for the list of module directories that contribute extra dictionary files. Must be called **before** `i18next.init()`. Follows the same inversion pattern as `registerAuditSink`: infrastructure cannot import modules, so paths are injected at boot.
- **`readLocaleDictionary(locale)`** – Loads the shared `<locale>.json`, then deep-merges each registered module's file on top. Exported so `GET /locales/:locale` sees the same merged result.
- **`loadLocaleResources()`** – Iterates `listSupportedLocales()`, calls `readLocaleDictionary` for each, and returns the i18next `Resource` shape (`{ locale: { translation: … } }`).
- **`deepMerge` / `isPlainObject`** (internal) – Recursive merge that descends into plain objects; arrays and scalars are replaced wholesale. Prevents last-loaded module from erasing a sibling's keys in a shared namespace.

## Relationships

- **`src/app.ts`** – Calls `registerLocaleDirectories` with the enabled modules' locale paths, then `loadLocaleResources()` to seed `i18next.init()`.
- **`src/infrastructure/i18n/overrides.ts`** – The database-driven overlay. It layers on top of what this file produces; the dependency is strictly one-directional (overrides → catalog), never reversed.
- **`src/infrastructure/i18n/context.ts`** – Consumes `getDefaultLocale` / `getFallbackLocale` and `localeCandidatesFor` when building the per-request locale context.
- **`src/infrastructure/i18n/index.ts`** – Barrel re-export of this module's public API.
- **`src/kernel/translation.ts`** – Defines the translation port. `localeCandidatesFor` intentionally lives here (catalog) rather than beside that port, per the repo's own precedent in `kernel/authentication.ts`.
- **`scenarios/locales.ts`** – Endpoint handler for `GET /locales/:locale`; uses `listSupportedLocales` and `readLocaleDictionary` to serve the merged dictionary.
- **`src/infrastructure/http/middlewares/locale.ts`** – Resolves the incoming request's locale tag, falling back through `getDefaultLocale` / `getFallbackLocale`.
- **`src/modules/account/tests/integration/persisted-locale.test.ts`** – Calls `resetSupportedLocales` between test cases to re-read a changed `NODE_SUPPORTED_LOCALES`.

## Notes

- **Module shadowing is permitted but tested against.** A module *can* overwrite a shared key (last-registered wins). The cross-cutting test `tests/cross-cutting/locale-namespaces.test.ts` fails if any module actually collides with the shared dictionary.
- **`listSupportedLocales` is cached for the lifetime of the process.** Adding a locale file at runtime has no effect until the process restarts and `i18next.init()` runs again. `resetSupportedLocales` exists only for tests.
- **`registerLocaleDirectories` replaces, not appends.** Calling it twice means only the second set is active.
- **`deepMerge` treats arrays as leaves** – a module that ships an array under the same key as the shared dictionary will replace it entirely, not concatenate.
