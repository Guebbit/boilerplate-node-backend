---
source: src/infrastructure/i18n/catalog.ts
sha256: e034c55f91c61867a691e1a3ca3b889a4d1cd898f9c106019cd7a009fa728893
generated_at: 2026-11-08T03:36:14.383720+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/catalog.ts

## Purpose

Single source of truth for where file-based translations live. It discovers locale JSON files, deep-merges per-module contributions on top of the shared dictionary, and produces the `i18next` `Resource` object handed to `init()` at boot. A project that moves its dictionaries edits this file and nothing else. The database overlay (`./overrides`) layers on top of the result in one direction only.

## Key elements

- **`LOCALES_DIRECTORY`** – Resolved from `__dirname` (not `process.cwd()`) to `shared/locales/`, so the path is identical from `src/cluster.ts`, a Jest worker, or a migration.
- **`getDefaultLocale()` / `getFallbackLocale()`** – Lazy readers for `NODE_DEFAULT_LOCALE` and `NODE_FALLBACK_LOCALE` from `localeConfig()`.
- **`localeCandidatesFor(locale)`** – Builds the deduplicated resolution chain: exact tag → base language → fallback. Pure function; no port or state.
- **`listSupportedLocales()`** – Returns `NODE_SUPPORTED_LOCALES` if set, otherwise the sorted directory listing of `*.json` files. Cached after first call.
- **`resetSupportedLocales()`** – Clears both the locale list and dictionary caches; intended for tests that change env between runs.
- **`registerLocaleDirectories(directories)`** – Replaces the set of module locale directories. Must be called before `i18next.init()`.
- **`readLocaleDictionary(locale)`** – Merges the shared file with every registered module's contribution (deep merge, registration order wins). Returns a `structuredClone` so callers can mutate safely.
- **`loadLocaleResources()`** – Iterates `listSupportedLocales()`, calls `readLocaleDictionary` for each, and returns the `Resource` map ready for `i18next.init()`.
- **`deepMerge` / `readDictionaryFile`** – Internal helpers for recursive plain-object merge and single-file JSON read.

## Relationships

- **`src/infrastructure/i18n/config.ts`** – Direct import; `localeConfig()` supplies `NODE_DEFAULT_LOCALE`, `NODE_FALLBACK_LOCALE`, and `NODE_SUPPORTED_LOCALES`.
- **`src/infrastructure/object-guards.ts`** – Direct import; `isPlainObject` gates the recursion in `deepMerge`.
- **`src/infrastructure/i18n/boot.ts`** – Consumes `loadLocaleResources()` and must call `registerLocaleDirectories()` before `init()`.
- **`src/infrastructure/i18n/overrides.ts`** – Layers DB-driven overrides on top of `readLocaleDictionary`'s output; one-way, never back.
- **`src/infrastructure/i18n/served.ts`** – Serves `readLocaleDictionary` behind `GET /locales/:locale`, so the endpoint sees the same merged result.
- **`src/infrastructure/http/middlewares/locale.ts`** – Resolves the request locale using `getDefaultLocale` / `localeCandidatesFor`.
- **`src/infrastructure/i18n/index.ts`** – Barrel that re-exports the public API of this module.
- **`src/kernel/translation.ts`** – Owns the translation port; `localeCandidatesFor` intentionally stays here rather than in that file because it is stateless with no module to answer it.
- **`scenarios/locales.ts`** – Test scenario that exercises `resetSupportedLocales` / `registerLocaleDirectories` to simulate different locale configurations.

## Notes

- `readLocaleDictionary` returns a **clone** per caller (`structuredClone`); the shared cache is never mutated by downstream consumers like the overrides layer.
- A module dictionary **can** shadow a shared key (deep merge, later registration wins), but `tests/cross-cutting/locale-namespaces.test.ts` enforces that nothing actually does.
- `listSupportedLocales` is cached permanently after the first call. A locale added to the directory or env after boot is **not** resolvable until `i18next.init()` runs again — the only sanctioned reset path is `resetSupportedLocales()`.
- `localeCandidatesFor` is deliberately kept here (not in `kernel/translation.ts`) because it is a pure helper with no state and no owning module.
- The dictionary cache is invalidated only by `registerLocaleDirectories` or `resetSupportedLocales`; the files themselves are build-time artifacts and cannot change inside a running process.
