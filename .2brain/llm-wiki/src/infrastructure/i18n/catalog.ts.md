---
source: src/infrastructure/i18n/catalog.ts
sha256: e034c55f91c61867a691e1a3ca3b889a4d1cd898f9c106019cd7a009fa728893
generated_at: 2026-10-29T02:06:38.756611+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/catalog.ts

## Purpose

Single source of truth for **where translations live on disk and how they are merged** before `i18next.init()` receives them. It resolves the shared locale directory, reads and deep-merges per-module dictionary files into one dictionary per locale, and exposes the final `Resource` object that boot hands to i18next. A project that relocates its dictionaries edits only this file.

## Key elements

- **`LOCALES_DIRECTORY`** (private const) — absolute path to `shared/locales/`, resolved from `__dirname` so it is stable across cluster entry points, Jest workers, and migrations.
- **`getDefaultLocale()`** — lazily returns `localeConfig().NODE_DEFAULT_LOCALE`; used when a request carries no locale tag.
- **`getFallbackLocale()`** — lazily returns `localeConfig().NODE_FALLBACK_LOCALE`; the target for missing-key fallback.
- **`localeCandidatesFor(locale)`** — pure function returning the deduplicated resolution chain `[exact, base-lang, fallback]`. Deliberately kept here (not in `kernel/translation.ts`) because it has no port or state.
- **`listSupportedLocales()`** — returns `NODE_SUPPORTED_LOCALES` if set, otherwise the `.json` file listing in `LOCALES_DIRECTORY`. Memoised after first call; safe to read once at boot.
- **`resetSupportedLocales()`** — clears both the locales cache and the dictionary cache. Intended for tests that mutate `NODE_SUPPORTED_LOCALES` post-import.
- **`registerLocaleDirectories(directories)`** — sets the ordered list of module-specific locale directories that contribute to the merged dictionary. Must be called **before** `i18next.init()`. Inverts the dependency: modules cannot be imported here (infrastructure is below them), so paths are pushed in at boot.
- **`readLocaleDictionary(locale)`** — reads the shared file, deep-merges every registered module's contribution in registration order, caches the merged result, and returns a `structuredClone` so each caller gets an independent copy. Exported so `GET /locales/:locale` can serve the same merged shape.
- **`loadLocaleResources()`** — maps `listSupportedLocales()` → `{ translation: readLocaleDictionary(locale) }`, producing the `i18next.Resource` object consumed by boot.
- **`deepMerge`** (private) — recursive merge that recurses only when both sides are plain objects (checked via `isPlainObject`); arrays and scalars are replaced wholesale.
- **`readDictionaryFile`** (private) — reads a single `<locale>.json` from a directory, returning `undefined` if the file is absent.

## Relationships

- **`src/infrastructure/i18n/config.ts`** — imported for `localeConfig()`; supplies `NODE_DEFAULT_LOCALE`, `NODE_FALLBACK_LOCALE`, and `NODE_SUPPORTED_LOCALES`.
- **`src/infrastructure/object-guards.ts`** — imported for `isPlainObject`, used inside `deepMerge` to decide whether to recurse or replace.
- **`src/infrastructure/i18n/boot.ts`** — calls `loadLocaleResources()` to obtain the `Resource` object for `i18next.init()`, and is expected to call `registerLocaleDirectories()` before init.
- **`src/infrastructure/i18n/overrides.ts`** — layers a database overlay on top of the dictionaries this file produces. Direction is one-way: overrides never write back into the file-based catalog.
- **`src/kernel/translation.ts`** — the translation port. `localeCandidatesFor` is explicitly kept in this file *instead of* that port, because it is stateless and has no module to answer to.
- **`src/infrastructure/i18n/index.ts`** — barrel re-export; consumers import from here rather than reaching into this file directly.
- **`src/modules/account/tests/integration/persisted-locale.test.ts`** — exercises locale persistence; relies on the lazy `getDefaultLocale`/`getFallbackLocale` reads and likely `resetSupportedLocales` between test cases.

## Notes

- **Cache invalidation is manual.** `dictionaryCache` and `supportedLocalesCache` are cleared only by `registerLocaleDirectories` and `resetSupportedLocales`. Nothing in production calls the reset; a locale added after boot is unresolvable until `i18next.init()` runs again.
- **Module shadowing is allowed but tested against.** A module *can* overwrite a shared key (last registration wins), but `tests/cross-cutting/locale-namespaces.test.ts` enforces that no module actually does.
- **`structuredClone` per read.** Every call to `readLocaleDictionary` returns a fresh deep copy, so the overrides layer (or any endpoint) can mutate its result without corrupting the shared cache entry.
- **Resolution is one index arm.** Because `localeCandidatesFor` is computed once per page (all three tags known before the query), the resolver does not do a per-entity DB lookup for locale fallback.
