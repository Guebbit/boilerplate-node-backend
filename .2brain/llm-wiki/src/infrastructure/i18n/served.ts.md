---
source: src/infrastructure/i18n/served.ts
sha256: 29b403477a5b4d44d609df7a51667e14e2c4ad53877f5aebcf3fc1c75cd3feb7
generated_at: 2026-11-08T03:37:34.907995+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/served.ts

## Purpose

Holds the single runtime answer to "which languages does this deployment serve right now?" and exposes the query functions every request layer (negotiation, emails, order snapshots) calls so they all agree. The state is populated by the database overlay's refresh cycle and never read from Mongo during a request; until the first refresh lands it is empty, meaning only deployed dictionary files plus the fallback are available.

## Key elements

- **`ServedLanguages`** (interface) — `{ active: ReadonlySet<string>, inactive: ReadonlySet<string> }`; the on/off partition of *registered* language tags after the last good refresh.
- **`served`** (module-level `let`) — the current snapshot; replaced as a whole object so readers never observe a torn state.
- **`setServedLanguages(active, inactive)`** — atomically replaces `served` with a new snapshot (called by the overrides refresh).
- **`resetServedLanguages()`** — clears both sets; only deployed files + fallback remain served.
- **`listServedLocales()`** — returns the ordered array of every tag a request may be answered in. Fallback is **first** (negotiator picks the first candidate for bare `*`), then active file-based locales, then active registered locales.
- **`isServedLocale(tag)`** — membership check against `listServedLocales()`.
- **`servedLocaleFor(locale)`** — resolves a (possibly regional) tag to the language a request/mail/snapshot actually runs in: the tag if it or its base is served, else the fallback.
- **`dictionaryLocaleFor(locale)`** — resolves a tag to the language the API's *own wording* is read in: the tag if it has a served file, else its base, else the fallback.
- **`hasServedDictionary(tag)`** — true when the tag has a deployed dictionary file **and** is not switched off. Distinguishes "served" from "has its own wording" (a registered language without a file is served but falls back key-by-key).
- **`draftLocaleFor(tag)`** — case-insensitive lookup of the registered *inactive* (draft) tag matching a client tag; never returns the fallback.

## Relationships

- **`./catalog`** — imports `getFallbackLocale` and `listSupportedLocales`; these supply the fallback tag and the set of deployed dictionary files that `listServedLocales` and `hasServedDictionary` start from.
- **`./overrides`** — the sole writer: its refresh cycle calls `setServedLanguages` (or `resetServedLanguages`) to update this module's state.
- **`./index`** — re-exports the public API of this module for consumers outside the i18n package.
- **`../http/middlewares/locale`** — uses `listServedLocales` / `servedLocaleFor` to negotiate the request locale header against the served set.
- **`/kernel/middlewares/locale-preview`** — kernel-level middleware that consults served state when rendering preview content.
- **`/modules/locales/controllers/get-locales`** — exposes the served (or draft) language list to the public API.
- **`/modules/sitemap/service`** — iterates `listServedLocales` to build per-locale sitemap entries.
- **`tests/unit/infrastructure/i18n/served.test.ts`** — unit tests for every exported function.
- **`tests/unit/infrastructure/http/middlewares/locale.test.ts`**, **`tests/unit/kernel/locale-preview.test.ts`**, **`tests/unit/kernel/translation.test.ts`**, **`src/modules/sitemap/tests/integration/sitemap.test.ts`** — downstream tests that exercise the served-state contract through their respective consumers.

## Notes

- **Fallback is always served and first.** It can be neither switched off nor deleted, and its position in `listServedLocales` is what makes `Accept-Language: *` (or no header) resolve to the fallback.
- **Atomic swap, no locking.** `served` is replaced by assigning a brand-new object; there is no per-field mutation, so concurrent readers see either the old or the new snapshot.
- **Base-language resolution is manual.** `servedLocaleFor` and `dictionaryLocaleFor` extract the base tag with `locale.split('-', 1)[0]` rather than a full BCP-47 subtag walk; a tag like `it-CH` is matched against `it`, not `it-CH` alone.
- **`draftLocaleFor` is exact-tag, case-insensitive only.** It does *not* fall back to the base language—`fr-CA` will not match a registered `fr`.
- **Empty initial state is intentional.** Before the first DB refresh, `active` and `inactive` are both empty sets, so the served list equals deployed files + fallback. Code should not assume a non-empty `active` set.
