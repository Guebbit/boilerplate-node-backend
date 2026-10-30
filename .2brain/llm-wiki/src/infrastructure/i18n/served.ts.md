---
source: src/infrastructure/i18n/served.ts
sha256: 29b403477a5b4d44d609df7a51667e14e2c4ad53877f5aebcf3fc1c75cd3feb7
generated_at: 2026-10-29T02:07:38.926129+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/served.ts

## Purpose

Holds the in-process, mutable state of which languages this deployment currently serves. A language is "served" if it has a deployed dictionary file (and is not switched off) or if it is a registered row that is switched on; the fallback language is always served unconditionally. This module is the single source of truth that locale negotiation, email rendering, order snapshots, and link generation all read from, so every part of a request agrees on the same language set.

## Key elements

- **`served`** (module-private) — `{ active: ReadonlySet<string>, inactive: ReadonlySet<string> }`. Replaced wholesale on each refresh so readers never see a torn state.
- **`setServedLanguages(active, inactive)`** — Called by the database overlay refresh (`./overrides`) to replace the on/off state of registered languages.
- **`resetServedLanguages()`** — Clears both sets, reverting the served set to deployed files plus the fallback only.
- **`listServedLocales()`** — Returns the full list of languages a request may be answered in: fallback first, then deployed files minus switched-off ones, then switched-on registered tags. Fallback is first so `negotiator` resolves a bare `*` or missing header to it.
- **`draftLocaleFor(tag)`** — Returns the registered spelling of a tag if it is a switched-off draft (never the fallback). Case-insensitive match; regional tags are not matched to their base.
- **`isServedLocale(tag)`** — Boolean: is `tag` in the served list?
- **`hasServedDictionary(tag)`** — Boolean: does the tag have a deployed dictionary file that is not switched off? (A registered language without a file is served but has no own wording.)
- **`servedLocaleFor(locale)`** — Resolves the effective language for a request, mail, or snapshot: the tag if served (or its base language is served), otherwise the fallback.
- **`dictionaryLocaleFor(locale)`** — Resolves the language for reading the API's own dictionary: the tag if it has a served file, else its base, else the fallback.

## Relationships

- **`./catalog`** — Imports `getFallbackLocale` and `listSupportedLocales`; every "what is served" computation builds on the deployed file list and the configured fallback.
- **`./overrides`** — The database overlay refresh calls `setServedLanguages` / `resetServedLanguages` to populate the state. This module never reads Mongo itself.
- **`./context`** — Request-level i18n context reads the served state (via `servedLocaleFor`, `dictionaryLocaleFor`) to pick the active locale for the current request.
- **`./index`** — Barrel re-export; other modules typically import these functions through the i18n package entry point.
- **`../http/middlewares/locale`** — Uses `servedLocaleFor` / `isServedLocale` during locale negotiation to select the response language.
- **`../../kernel/middlewares/locale-preview`** — Reads the served list to build the preview-language switcher for the UI.
- **`../../modules/locales/controllers/get-locales`** — Calls `listServedLocales` and `draftLocaleFor` to expose the current language roster to clients.
- **`../../modules/sitemap/service`** — Iterates `listServedLocales` to generate one sitemap entry per served language.
- **`../http/frontend-link`** — Uses the served locale to build localized frontend URLs.

## Notes

- **Fallback ordering is load-bearing.** `listServedLocales` deliberately puts the fallback tag first because the `negotiator` library returns the first candidate when the client sends `*` or no `Accept-Language` header. Reordering breaks bare-`*` resolution.
- **State is process-local and empty until first refresh.** Between process start and the first successful overlay refresh, only deployed files (plus fallback) are served. There is no Mongo read on the request path.
- **`served` is replaced, not mutated in place.** `setServedLanguages` and `resetServedLanguages` assign a new object, guaranteeing that a concurrent reader sees either the old or the new set, never a mix.
- **`draftLocaleFor` never returns the fallback.** Even if someone registers the fallback tag as inactive, `draftLocaleFor` explicitly excludes it, so the fallback is never surfaced as an editable draft.
- **`servedLocaleFor` vs `dictionaryLocaleFor`.** The former governs *which language the user-facing content is in*; the latter governs *which dictionary file the API reads its own strings from*. A regional tag (e.g. `it-CH`) may be served (user sees Italian) while the dictionary is read from the `it` file.
