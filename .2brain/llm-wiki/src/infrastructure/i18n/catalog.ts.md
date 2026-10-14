---
source: src/infrastructure/i18n/catalog.ts
sha256: 0923218eae4bcae397739881a08c40e4a333d6828febbc8dfe3452290e9ac126
generated_at: 2026-10-14T08:02:46.395582+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/catalog.ts

## Purpose

The single source of truth for where translation dictionaries physically live and how they are assembled. It discovers locale JSON files from the shared `locales/` directory and any registered per-module directories, deep-merges them per locale, and produces the `i18next.Resource` object that `i18next.init()` consumes at boot. A project that relocates or restructures its dictionaries edits this file and nothing else.

## Key elements

- **`LOCALES_DIRECTORY`** — Resolved from `__dirname` (not `process.cwd()`), so the same path works whether the entry point is a server, a Jest worker, or a migration.
- **`getDefaultLocale()` / `getFallbackLocale()`** — Lazy reads of `NODE_DEFAULT_LOCALE` and `NODE_FALLBACK_LOCALE` from `localeConfig()`, so tests can mutate env after import.
- **`localeCandidatesFor(locale)`** — Pure function that builds the resolution chain (exact tag → base language → fallback), deduplicated. Lives here rather than in the `kernel/translation.ts` port because it is stateless and has no module to answer.
- **`listSupportedLocales()`** — Returns `NODE_SUPPORTED_LOCALES` if set, otherwise the `.json` filenames in `LOCALES_DIRECTORY`. Cached after the first call so the list is stable for the lifetime of the process.
- **`resetSupportedLocales()`** — Clears the locale and dictionary caches; intended for tests that change `NODE_SUPPORTED_LOCALES` mid-run.
- **`registerLocaleDirectories(directories)`** — Declares which module directories contribute additional dictionaries. Must be called **before** `i18next.init()` because `loadLocaleResources()` resolves through it.
- **`readLocaleDictionary(locale)`** — Deep-merges the shared dictionary with every registered module's contribution (registration order wins on collision). Returns a `structuredClone` so each caller gets an independent copy.
- **`loadLocaleResources()`** — Builds the full `i18next.Resource` map (`{ locale: { translation: … } }`) for all supported locales; the object `i18next.init()` receives.

## Relationships

- **`src/infrastructure/i18n/config.ts`** — Source of `localeConfig()`; supplies `NODE_DEFAULT_LOCALE`, `NODE_FALLBACK_LOCALE`, and `NODE_SUPPORTED_LOCALES`.
- **`src/infrastructure/object-guards.ts`** — Provides `isPlainObject`, used by the internal `deepMerge` to decide whether to recurse or overwrite.
- **`src/infrastructure/i18n/boot.ts`** — Calls `registerLocaleDirectories` (with each enabled module's locale paths) and then `loadLocaleResources` to feed `i18next.init()`.
- **`src/infrastructure/i18n/overrides.ts`** — Layers database-stored overrides **on top of** the merged dictionary this file produces; strictly one-directional, never written back.
- **`src/infrastructure/i18n/context.ts`** — Consumes `getDefaultLocale`, `getFallbackLocale`, and `localeCandidatesFor` to resolve per-request locale chains.
- **`src/kernel/translation.ts`** — Defines the translation port; `localeCandidatesFor` deliberately stays in this file (stateless helper, no port needed), consistent with the repo's `kernel/authentication.ts` precedent.
- **`src/infrastructure/i18n/index.ts`** — Barrel re-export; external modules import the public API through it.
- **`src/infrastructure/http/middlewares/locale.ts`** — Reads the locale from the request and calls `localeCandidatesFor` to build the lookup chain.
- **`src/modules/account/tests/integration/persisted-locale.test.ts`** — Integration test that exercises the full catalog → override → resolution path with a persisted user locale.

## Notes

- **Cache is process-lifetime.** `listSupportedLocales` and `dictionaryCache` are never invalidated in production. A locale file added after boot is invisible until a restart; `resetSupportedLocales` exists solely for test harnesses.
- **`structuredClone` on every read.** `readLocaleDictionary` always returns a fresh copy. This is what allows `overrides.ts` to mutate the dictionary in place without poisoning the shared cache.
- **Deep merge, not shallow.** Two modules can contribute different sub-keys under the same top-level namespace (e.g., `account` and `users` both writing under `shared.*`). A shallow assign would let the last-registered module erase the other's keys.
- **Module shadowing is legal but policed.** A module dictionary *can* override a shared key by construction, but `tests/cross-cutting/locale-namespaces.test.ts` fails if any collision actually occurs in the repo.
- **`localeCandidatesFor` is pure locale arithmetic.** No I/O, no port, no registration. This is why it is exported from this file rather than tucked into the kernel port.
