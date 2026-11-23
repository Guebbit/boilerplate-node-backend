---
source: src/infrastructure/i18n/served.ts
source_sha256: f31ae4914d8e4bc99da1e1ec9f5a46b0aa4251527cb956e0b1923286b50a72a8
context_sha256: 7789cde831608f0cded9b6f18c934a7a44cd6c71342146e3afddc27a80d48631
generated_at: 2026-11-22T02:56:37.377155+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/i18n/served.ts

## Purpose
Holds the single, in-memory answer to "which languages does this deployment serve right now?", so negotiation, emails and order snapshots all agree. A language is served if it is switched on (a deployed dictionary file or a registered row), and the fallback language always is. Switched-off languages are never selected; the fallback is used instead. State is filled by the database overlay's refresh (`./overrides`), never read from Mongo during a request. Until the first refresh it is empty, so only the deployed files are served.

## Key elements
- `setServedLanguages(active, inactive)`: replaces the registered languages' on/off state as a whole with the result of one refresh.
- `resetServedLanguages()`: clears that state, so only deployed files and the fallback are served.
- `listServedLocales()`: deployed files minus switched-off tags, plus switched-on registered tags, plus the fallback. The fallback is placed first.
- `draftLocaleFor(tag)`: returns the registered spelling of a switched-off ("draft") language that the tag names, or `undefined`. It never returns the fallback, ignores case, and matches the exact tag only (a regional tag is not its base language's draft).
- `isServedLocale(tag)`: whether the canonicalised tag is in `listServedLocales()`.
- `hasServedDictionary(tag)`: whether the API has its own deployed dictionary file for the tag and it is not switched off. A registered language without a file is served but has no dictionary.
- `servedLocaleFor(locale)`: returns the canonical tag if it or its base language is served (`it-CH` follows `it`), otherwise the fallback.
- `dictionaryLocaleFor(locale)`: returns the tag if it has a served dictionary, else its base language if that does, else the fallback.

## Relationships
- Imports `getFallbackLocale` and `listSupportedLocales` from `./catalog` (the deployed dictionary files and the fallback).
- Imports `baseLanguage` and `canonicalLocale` from `./locale-tag` for tag normalisation.
- `./overrides` is the documented writer: its refresh feeds `setServedLanguages` and `resetServedLanguages`.
- The rest of the neighbor list (the locale middleware, locale preview, the locales controller, the sitemap service, `./context`, `./index`, `frontend-link`) and the unit and integration tests are connected through the dependency graph. The file's content does not show how they use it.

## Notes
- State is a module-level variable replaced whole on each refresh, so readers never see a half-updated answer.
- The fallback comes first in `listServedLocales()` deliberately: `negotiator` answers a bare `*` or a missing header with the first candidate it is offered, so both resolve to the fallback.
- The fallback cannot be switched off or deleted.
- Tags are compared in canonical form, so `pt-br` and `pt-BR` are one answer.
- A saved tag that was later switched off falls back to the fallback language.
