---
source: src/infrastructure/i18n/catalog.ts
generated_at: 2026-11-22T02:55:20.019830+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/i18n/catalog.ts

## Purpose
Defines where translations come from: discovery of `<locale>.json` dictionary files, the per-module merge, and the resources handed to `i18next.init()` at boot. It deals with files only. The database overlay in `./overrides` layers on top of this output, never the other way round. A project that moves its dictionaries edits only this file.

## Key elements
- `getDefaultLocale()` / `getFallbackLocale()`: read `NODE_DEFAULT_LOCALE` and `NODE_FALLBACK_LOCALE` from `localeConfig()` lazily, so tests can set them after import.
- `localeCandidatesFor(locale)`: returns the locale chain, most specific first. The order is the canonical tag, its base language, then the fallback locale. The result is deduplicated and empty tags are dropped.
- `listSupportedLocales()`: returns `NODE_SUPPORTED_LOCALES` when set, otherwise the sorted tags of the shared directory's dictionary files. The result is memoised.
- `resetSupportedLocales()`: clears the supported-locales cache and the dictionary cache. It is meant for tests.
- `registerLocaleDirectories(directories)`: replaces the set of module directories that contribute dictionaries and clears the dictionary cache. It must run before `i18next.init()`.
- `readLocaleDictionary(tag)`: returns one language's merged dictionary. It reads the shared file, then deep-merges each registered directory's file on top, caches the result, and returns a `structuredClone` per caller. It is exported for `GET /locales/:locale`.
- `loadLocaleResources()`: builds i18next's `Resource` shape, `{ [locale]: { translation: dictionary } }`, for every supported locale.
- Private helpers:
  - `dictionaryFilesIn`: maps canonical tag to file stem for one directory.
  - `dictionaryPathIn`: resolves the path of one language's file in a directory.
  - `readDictionaryFile`: reads and parses one file, or returns `undefined` if the directory lacks the language.
  - `deepMerge`: recursively merges plain objects, and any other value is replaced by the source.

## Relationships
- Imports `localeConfig` from `src/infrastructure/i18n/config.ts` for the default, fallback and supported locale settings.
- Imports `canonicalLocale` and `baseLanguage` from `src/infrastructure/i18n/locale-tag.ts` for tag normalisation.
- Imports `isPlainObject` from `src/infrastructure/object-guards.ts` for `deepMerge`.
- The `localeCandidatesFor` comment refers to the port in `src/kernel/translation.ts`. The helper stays here because it has no state and no module to answer it.
- The comments say `bootI18n` (in `src/infrastructure/i18n/boot.ts`) calls `registerLocaleDirectories` with the enabled modules' `locales` paths.
- The comments say the overrides layer (`src/infrastructure/i18n/overrides.ts`) mutates the cloned dictionaries, and that `GET /locales/:locale` consumes `readLocaleDictionary`.

## Notes
- `LOCALES_DIRECTORY` is resolved from `__dirname` (`../../../shared/locales`), not `process.cwd()`. It is therefore the same under `src/main.ts`, a Jest worker or a migration.
- File names are matched by canonical tag, so a mis-cased file name such as `pt-br.json` is read as `pt-BR`. Two files that canonicalise to the same tag throw at boot.
- `readLocaleDictionary` reads the shared file unguarded. A language with no shared file causes a read error.
- Modules can shadow shared keys because later directories win on collision. The comments say nothing does and that `tests/cross-cutting/locale-namespaces.test.ts` fails if one starts.
- The supported-locales list is cached because `i18next.init()` reads it only once. A locale added after boot is not resolvable until init runs again.
- `dictionaryFilesIn` rescans the directory on every call and is not cached. Only the merged dictionaries are cached.
