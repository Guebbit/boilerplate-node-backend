---
source: src/modules/locales/controllers/get-locales.ts
sha256: a8ef020ccb1d766c4dae860a4158f26227b7287601bc50335c4b75abc4403e10
generated_at: 2026-10-29T04:20:19.849657+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locales.ts

## Purpose
Express route handlers for the three locale-reading endpoints (`GET /locales`, `GET /locales/:locale`, `GET /locales/:locale/dictionary`). The first two delegate to `localeService` with caller-scoped permissions; the third serves the API's own ~60-key message dictionary straight from the filesystem, acting as a fallback when the database-backed catalog is unavailable.

## Key elements
- **`getLocales`** — Returns the full `LocaleCapabilities` list via `localeService.listCapabilities`, passing the caller's scope and standing for role-based row filtering. Errors are funneled through `catchAs`.
- **`getLocale`** — Returns a single `Language` row via `localeService.readLanguage`. Uses `refused` to short-circuit on permission denial before emitting a success response.
- **`getLocaleDictionary`** — Synchronous handler. Validates the locale against `hasServedDictionary` (which also serves as the path-traversal guard), then returns `{ locale, messages: readLocaleDictionary(locale) }` as a `LocaleDictionary`. Responds 404 with a `t`-translated error message for unknown or disabled locales.

## Relationships
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (promise-error → error response) and `refused` (permission-denial short-circuit) used by all three handlers.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` for shaping the JSON envelope.
- **`src/infrastructure/i18n/index.ts`** — Barrel re-export consumed here for `hasServedDictionary`, `readLocaleDictionary`, and `t`.
- **`src/infrastructure/i18n/served.ts`** — Source of `hasServedDictionary`, which checks the served-dictionary directory and doubles as the 404 / traversal guard.
- **`src/infrastructure/i18n/catalog.ts`** — Source of `readLocaleDictionary`, which loads the per-locale JSON from disk.
- **`src/infrastructure/i18n/context.ts`** — Source of `t`, the server-side translation helper used for the 404 error message.
- **`src/modules/locales/routes.ts`** — Wires these three handlers to their Express paths and attaches `getAuth` so `request.caller` is populated.
- **`src/modules/locales/services/index.ts`** — Exports `localeService`, the domain service backing `getLocales` and `getLocale`.
- **`src/types/index.ts`** — Defines `Language`, `LocaleCapabilities`, and `LocaleDictionary` used as response type parameters.

## Notes
- `getLocales` and `getLocale` are promise-based; `getLocaleDictionary` is fully synchronous. This is intentional — the dictionary path has no async I/O (filesystem read is synchronous in this codebase) and must work during a DB outage.
- The `scopes` field on each capability row distinguishes `api` (usable as `Accept-Language`) from `app` (dictionary downloadable). A DB outage only degrades the `app` rows.
- `request.caller` is set upstream by `getAuth` in `routes.ts`; the handlers assume it is present.
- The dictionary endpoint's locale validation relies on `hasServedDictionary` checking the actual directory listing, so a disabled locale and an unknown locale are indistinguishable (both 404).
