---
source: src/infrastructure/i18n/served.ts
sha256: 41ead6dddfdd2f8eb6d77e268442c060f1dd3ff081e4a07d6fe61491a1f265ca
generated_at: 2026-11-14T18:09:52.769923+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/served.ts

## Purpose

In-memory registry of which languages this deployment serves *right now*. It combines the set of deployed dictionary files with the on/off state of registered languages (pushed in by the `overrides` refresh) to produce a single, request-consistent list of answerable locales. It exists so that every part of a request — negotiation, email rendering, order snapshots — resolves to the same set without hitting the database per request.

## Key elements

- **`ServedLanguages`** (interface, not exported) — holds two `ReadonlySet<string>` fields (`active`, `inactive`) representing registered languages that are on/off. The module-level `served` binding is swapped wholesale on each refresh so readers never see a torn state.
- **`setServedLanguages(active, inactive)`** — replaces the on/off sets with the result of one database-overlay refresh. Called by `./overrides`.
- **`resetServedLanguages()`** — clears both sets, leaving only deployed files and the fallback.
- **`listServedLocales()`** — returns the full ordered list a request may be answered in: fallback first, then deployed files minus switched-off ones, then registered active languages. Deduplicated.
- **`draftLocaleFor(tag)`** — returns the registered spelling of a draft (switched-off) language for a client tag, or `undefined`. Never matches the fallback.
- **`isServedLocale(tag)`** — canonical, case-blind check that a tag is in the served set.
- **`hasServedDictionary(tag)`** — true when a deployed file exists for the tag *and* it hasn't been switched off.
- **`servedLocaleFor(locale)`** — resolves a stored/negotiated tag to the language the request runs in: the tag (or its base) if served, otherwise the fallback.
- **`dictionaryLocaleFor(locale)`** — resolves a tag to the language whose dictionary file the API's own wording is read in, falling back through base language then the global fallback.

## Relationships

- **`./catalog`** (imported) — source of `getFallbackLocale()` and `listSupportedLocales()` (the set of deployed dictionary files). `served.ts` filters and extends that set.
- **`./locale-tag`** (imported) — source of `canonicalLocale()` and `baseLanguage()` used for normalisation and base-language fallback logic.
- **`./overrides`** — the writer side: its refresh calls `setServedLanguages` / `resetServedLanguages` to push the latest on/off state into this module.
- **`src/infrastructure/http/middlewares/locale.ts`** — consumes `servedLocaleFor` / `isServedLocale` to resolve the active locale per request.
- **`src/modules/locales/controllers/get-locales.ts`** — reads `listServedLocales` to report which languages are available to the frontend.
- **`src/modules/sitemap/service.ts`** — uses `listServedLocales` to decide which locale paths appear in the sitemap.
- **`src/infrastructure/http/frontend-link.ts`** — builds locale-scoped URLs for the served set.
- **`src/kernel/middlewares/locale-preview.ts`** — uses `draftLocaleFor` / `servedLocaleFor` to let a user preview a switched-off language.

## Notes

- The state is **never** read from Mongo at request time. Until the first `overrides` refresh lands, `served` is empty, which means the served set equals the deployed files plus the fallback.
- `listServedLocales` places the fallback **first** intentionally: the downstream `negotiator` library returns the first candidate for a bare `*` or missing `Accept-Language` header, so order is load-bearing.
- `draftLocaleFor` explicitly excludes the fallback tag, so the fallback can never be treated as a "draft" even if it somehow appeared in the inactive set.
- `servedLocaleFor` follows the tag → base-language → fallback chain (e.g. `it-CH` → `it` → fallback), but `dictionaryLocaleFor` adds a second lookup: it checks whether the base language actually has its own file before falling through to the global fallback.
- All tag comparisons go through `canonicalLocale`, so `pt-br` and `pt-BR` are the same answer, but a regional tag (`pt-BR`) is **not** the same as its base (`pt`) for draft matching.
