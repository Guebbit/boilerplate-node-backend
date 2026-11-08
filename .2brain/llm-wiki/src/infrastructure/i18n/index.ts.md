---
source: src/infrastructure/i18n/index.ts
sha256: d8ea365174cc839a384c53a05ae586078a771d7e7d2154ef3d391d6bb8bfcfc9
generated_at: 2026-11-08T03:36:57.035164+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/index.ts

## Purpose

Barrel (re-export) module that serves as the single import point for all i18n functionality. Importing `t` or any other i18n symbol from `@infrastructure/i18n` (this file) keeps the global i18next instance out of the request path and routes through the per-request context defined in `./context`. It also exposes catalog, overrides, served-language, and boot APIs so ~70 call-sites can use one alias.

## Key elements

- **`t`, `translator`, `createLocaleContext`, `createPreviewContext`, `runWithLocale`, `runWithLocaleContext`, `getLocaleContext`, `getCurrentLocale`, `LocaleContext`** (from `./context`) — the per-request translation function and its scoping helpers; `t` is the primary entry point for translating a string in the current request's locale.
- **`bootI18n`** (from `./boot`) — one-time startup of the shared i18next instance (loads resources, registers backends).
- **`getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `localeCandidatesFor`, `readLocaleDictionary`, `registerLocaleDirectories`, `resetSupportedLocales`** (from `./catalog`) — locale resource loading, candidate-chain resolution, and supported-locale registry.
- **`applyLocaleOverlay`, `applyLocaleOverrides`, `getOverrideRefreshMs`, `isLocaleOverrideAvailable`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `LocaleOverlay`, `LocaleOverrideProvider`** (from `./overrides`) — admin-side translation overlay: register a provider, poll for refreshes, and apply per-locale overrides on top of the base catalog.
- **`dictionaryLocaleFor`, `draftLocaleFor`, `hasServedDictionary`, `isServedLocale`, `listServedLocales`, `resetServedLanguages`, `servedLocaleFor`, `setServedLanguages`** (from `./served`) — determines which languages a given request may actually be answered in (subset of supported locales).

## Relationships

- **`src/app.ts`** — calls `bootI18n` during application startup to initialise the shared i18next instance before any request is handled.
- **`src/app/error-handling.ts`** — imports `t` (or `runWithLocale`) to render localised error messages.
- **`src/infrastructure/http/errors.ts`** — uses `t` to produce locale-aware HTTP error bodies.
- **`src/infrastructure/http/middlewares/locale.ts`** — explicitly *not* part of this barrel; owns `Accept-Language` negotiation via `request.acceptsLanguages`. This barrel's `./served` module only decides *which* locales are valid; `locale.ts` picks *which one* the client actually got.
- **`scenarios/locales.ts`** — test scenario that exercises the catalog/served/locale-context exports end-to-end.
- **`scenarios/products.ts`**, **`scenarios/support/demo.ts`** — import i18n symbols to assert localised output in product and demo flows.
- **`scripts/ops/prepare-job.ts`**, **`scripts/ops/reapply-erasures.ts`** — ops scripts that import catalog/boot helpers to load or verify translation resources outside a live request.

## Notes

- **Never import `t` directly from `'i18next'`.** The doc block explicitly forbids it because i18next's default export is a single global instance with one active language; this barrel routes through `./context` to keep the active locale per-request.
- **The translation "port" lives in `kernel/translation.ts`**, not here. A module's *published* translation vocabulary is defined there (same inversion pattern as `kernel/authentication.ts`). This barrel is the *infrastructure* implementation, not the contract.
- **`Accept-Language` parsing is not in this directory.** It is handled by `attachLocale` in `http/middlewares/locale.ts`; do not add a hand-rolled language parser to `./catalog` or `./served`.
- All ~70 import sites use the alias `@infrastructure/i18n`, which resolves to this file. Adding a new sub-module export means updating this barrel.
