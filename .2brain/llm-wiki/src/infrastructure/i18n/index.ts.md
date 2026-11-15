---
source: src/infrastructure/i18n/index.ts
sha256: c252b1fb81412ee5ebf2b03196033ed8d93e8478e186c31279d5bcff2ffbacf8
generated_at: 2026-11-14T18:08:20.636712+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/index.ts

## Purpose

Request-scoped i18n barrel that re-exports the sub-modules under `src/infrastructure/i18n/` so that every call site imports `t` and locale utilities from `@infrastructure/i18n` rather than reaching into `i18next` directly. This keeps the single global i18next instance out of the per-request path.

## Key elements

- **`t`, `translator`, `runWithLocale`, `getLocaleContext`, `createLocaleContext`, `createPreviewContext`** (from `./context`) — the per-request translation function and locale-context helpers.
- **`bootI18n`** (from `./boot`) — one-time startup of the shared i18next instance.
- **`getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `localeCandidatesFor`, `readLocaleDictionary`, `resetSupportedLocales`** (from `./catalog`) — translation loading and the pure locale-candidate resolution chain.
- **`baseLanguage`, `canonicalLocale`, `canonicalLocaleSetter`, `isWellFormedLocale`** (from `./locale-tag`) — BCP-47 tag parsing/normalization helpers.
- **`refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `resetLocaleOverrides`, `isLocaleOverrideAvailable`, `getOverrideRefreshMs`** + types `LocaleOverlay`, `LocaleOverrideProvider` (from `./overrides`) — admin overlay that can hot-swap translations at runtime.
- **`setServedLanguages`, `resetServedLanguages`, `listServedLocales`, `isServedLocale`, `servedLocaleFor`, `dictionaryLocaleFor`, `draftLocaleFor`, `hasServedDictionary`** (from `./served`) — gates which languages a request may actually be answered in.

## Relationships

- All listed graph neighbors — `scenarios/locales.ts`, `scenarios/products.ts`, `scenarios/support/demo.ts`, `scripts/ops/reapply-erasures.ts`, `src/app.ts`, `src/app/boot-rendering.ts`, `src/app/error-handling.ts`, and the HTTP middleware files (`errors.ts`, `frontend-link.ts`, `ids.ts`, `content-type.ts`, `human-challenge.ts`, `idempotency.ts`, `json-depth.ts`, `json-object.ts`) — import their i18n symbols from this barrel via the `@infrastructure/i18n` path alias.

## Notes

- This is an **intentional, selective** re-export list, not a catch-all barrel: a re-export that nothing imports should be removed. Do not add speculative exports.
- The rule "import `t` from here, never from `'i18next'`" is a hard convention stated in the docblock.
- The docblock explicitly states that `Accept-Language` matching and the translation port (a module's published vocabulary) are owned elsewhere; do not add those concerns to this directory.
- `./config` is not re-exported here; each consuming file imports its config slice directly, consistent with every other `config.ts` in the codebase.
