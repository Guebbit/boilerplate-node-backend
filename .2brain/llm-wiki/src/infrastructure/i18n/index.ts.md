---
source: src/infrastructure/i18n/index.ts
source_sha256: 27c82949cbf63ece03763f587aa40070e7743d3367b8620459dbbd8e5c08c367
context_sha256: 0c65cbb0e993af92ae3656feb1a2cd5e5867824bc290b2d18767bd117ddcdef5
generated_at: 2026-11-22T02:55:59.416295+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/i18n/index.ts

## Purpose
Request-scoped i18n barrel. Application code imports `t` and related helpers from `@infrastructure/i18n` instead of from `'i18next'` directly. i18next's default export is a single global instance with one active language, and this barrel keeps that global out of the request path (per-request state lives in `./context`). The file contains only re-exports.

## Key elements
- **From `./catalog`**: `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `localeCandidatesFor` (the pure locale fallback chain), `readLocaleDictionary`, `resetSupportedLocales`.
- **From `./boot`**: `bootI18n`, which starts up the shared i18n instance.
- **From `./locale-tag`**: `baseLanguage`, `canonicalLocale`, `canonicalLocaleSetter`, `isWellFormedLocale`.
- **From `./overrides`** (admin overlay): `registerLocaleOverrideProvider`, `refreshLocaleOverrides`, `startLocaleOverrideRefresh` / `stopLocaleOverrideRefresh`, `getOverrideRefreshMs`, `isLocaleOverrideAvailable`, `resetLocaleOverrides`, plus the types `LocaleOverlay` and `LocaleOverrideProvider`.
- **From `./served`** (which languages a request may be answered in): `setServedLanguages`, `resetServedLanguages`, `listServedLocales`, `isServedLocale`, `servedLocaleFor`, `dictionaryLocaleFor`, `draftLocaleFor`, `hasServedDictionary`.
- **From `./context`** (per-request translation): `t`, `translator`, `runWithLocale`, `runWithLocaleContext`, `createLocaleContext`, `createPreviewContext`, `getCurrentLocale`, `getLocaleContext`, and the type `LocaleContext`.

## Relationships
The neighbor list gives dependency-graph edges but not the import statements, so only the following is stated by the file itself:
- Consumers elsewhere in the repo, such as the app boot files (`src/app/*`), the HTTP layer (`src/infrastructure/http/*`, including its middlewares), scenarios and ops scripts, are expected to import from this barrel via `@infrastructure/i18n`.
- `Accept-Language` matching is not done in this directory; it is left to the request-locale middleware.
- The translation port (a module's published vocabulary) is also not owned by this directory.

## Notes
- Every import site uses `@infrastructure/i18n`, except `./config`. That file is not re-exported here and its slice is imported per file, like every other `config.ts`.
- This is not a module barrel. A re-export that nothing imports should be removed.
