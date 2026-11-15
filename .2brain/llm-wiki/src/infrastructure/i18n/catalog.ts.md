---
source: src/infrastructure/i18n/catalog.ts
sha256: e90a0c6b75298182abe2b3b4e6b84dfe185e9ea142e5400f25396faab2c906bb
generated_at: 2026-11-14T18:07:47.776476+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/catalog.ts

## Purpose

Discovery, per-module merge, and resource assembly for i18next dictionaries. This file is the single source of truth for *where* translation JSON files live on disk and how they are combined into the `Resource` object consumed at boot. A project that relocates its dictionaries edits only this file.

## Key elements

- **`LOCALES_DIRECTORY`** – constant path to `shared/locales`, resolved from `__dirname` (not `process.cwd()`) so it is stable across `src/cluster.ts`, Jest workers, and migrations.
- **`dictionaryFilesIn(directory)`** – lists `.json` files in a directory, keyed by canonical locale tag; throws at boot if two files canonicalise to the same tag.
- **`dictionaryPathIn(directory, locale)`** – resolves the absolute path of one locale's dictionary file, or `undefined`.
- **`getDefaultLocale()` / `getFallbackLocale()`** – lazy reads of `NODE_DEFAULT_LOCALE` / `NODE_FALLBACK_LOCALE` from `localeConfig()`.
- **`localeCandidatesFor(locale)`** – builds the resolver's fallback chain (exact tag → base language → fallback locale), deduplicated. Deliberately kept here rather than in `kernel/translation.ts` because it is a stateless helper with no owning port.
- **`listSupportedLocales()`** – returns the supported locale list (env-driven or directory listing), cached after first call.
- **`resetSupportedLocales()`** – clears the supported-locale cache and dictionary cache; intended for tests that mutate env.
- **`registerLocaleDirectories(directories)`** – replaces the set of module locale directories; must be called **before** the boot sequence that reads them.
- **`deepMerge(target, source)`** – recursive merge of plain objects; non-object leaves are replaced.
- **`readLocaleDictionary(tag)`** – merged dictionary for one locale (shared file first, module contributions layered on top), cached, returned as a `structuredClone` per caller.
- **`loadLocaleResources()`** – produces the full `i18next.Resource` object for all supported locales, ready to hand to the initialiser.

## Relationships

- **`src/infrastructure/i18n/config.ts`** – imports `localeConfig` for `NODE_DEFAULT_LOCALE`, `NODE_FALLBACK_LOCALE`, and `NODE_SUPPORTED_LOCALES`.
- **`src/infrastructure/i18n/locale-tag.ts`** – imports `baseLanguage` and `canonicalLocale` for tag normalisation and base-language extraction.
- **`src/infrastructure/object-guards.ts`** – imports `isPlainObject` used by `deepMerge` to decide whether to recurse or replace.
- **`src/infrastructure/i18n/boot.ts`** – the caller of `registerLocaleDirectories` and `loadLocaleResources` during the startup sequence that assembles the i18next configuration.
- **`src/infrastructure/i18n/overrides.ts`** – the database overlay that layers *on top of* this file's output; the dependency is strictly one-directional (catalog → overrides, never back).
- **`src/infrastructure/i18n/index.ts`** – barrel re-export of this module's public API.
- **`src/kernel/translation.ts`** – the translation port; `localeCandidatesFor` lives here in catalog rather than alongside that port because it is a pure helper with no module to answer to.

## Notes

- `LOCALES_DIRECTORY` is anchored to `__dirname`, so the path is identical regardless of which entry point or test runner loads the file.
- `registerLocaleDirectories` must run before the boot sequence that calls `loadLocaleResources`; calling it after has no effect because the resources have already been read.
- `readLocaleDictionary` returns a `structuredClone` on every call so that downstream mutations (the overrides layer) cannot corrupt the shared cache.
- A module *can* shadow a shared key at the merge step, but `tests/cross-cutting/locale-namespaces.test.ts` enforces that no module actually does.
- `listSupportedLocales` is cached; changing `NODE_SUPPORTED_LOCALES` after the first call requires `resetSupportedLocales()` (test-only path).
