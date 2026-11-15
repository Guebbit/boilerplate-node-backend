---
source: src/modules/locales/controllers/get-locales.ts
sha256: ac6645ea7f807092d84c0501046be45b81d7e706cb9e13ae9d689e589585bc55
generated_at: 2026-11-14T20:17:47.358944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locales.ts

## Purpose

Express route handlers for the three read-only locale endpoints (`GET /locales`, `GET /locales/:locale`, `GET /locales/:locale/dictionary`). They thin-wire the HTTP layer to `localeService` (database-backed) and to the filesystem-backed i18n dictionary, applying caller scoping, ETag caching, and standard error responses.

## Key elements

- **`getLocales`** — Returns every language the deployment offers (both `api` and `app` scopes) with capability flags. Delegates to `localeService.listCapabilities`, passing the caller's scope and standing. Errors are funneled through `catchAs(response, 'listLocales')`.
- **`getLocale`** — Returns a single language row. Calls `localeService.readLanguage` with the same scoping. On success, sets an ETag via `setEtag` (enables `If-Match` for edits) before sending the payload. A `refused` result short-circuits the response.
- **`getLocaleDictionary`** — Serves the API's own ~60 message keys for a locale, read from the filesystem via `readLocaleDictionary`. Validity is checked with `hasServedDictionary` (which also serves as the path-traversal guard and the 404 check for disabled locales). Deliberately separate from the database-backed `GET /locales/:locale/messages` route so it remains available during a database outage.

## Relationships

- **`src/modules/locales/services/index.ts`** — Provides `localeService`; the only data source for the two capability endpoints.
- **`src/modules/locales/routes.ts`** — Registers these three handlers upstream; the comment in this file notes that `getAuth` on the route is what makes `request.caller` readable.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` wrap every outgoing payload.
- **`src/infrastructure/http/controller.ts`** — `catchAs` (promise-rejection → error response) and `refused` (403/404 short-circuit) are the error-handling primitives.
- **`src/infrastructure/http/preconditions.ts`** — `setEtag` attaches the `ETag` header on `getLocale`.
- **`src/infrastructure/i18n/index.ts`** (re-exports from `served.ts`, `catalog.ts`, `context.ts`) — Supplies `hasServedDictionary`, `readLocaleDictionary`, and the `t` translation function used for the 404 error body.
- **`src/types/index.ts`** — Defines `LocaleCapabilities`, `Language`, `LocaleDictionary` used as generic parameters on the response helpers.

## Notes

- The two service-backed endpoints are "best-effort" on the dynamic half: a database outage degrades the downloadable-language list but does not affect the filesystem dictionary endpoint.
- `getLocaleDictionary` intentionally does **not** call `localeService`; it trusts the served directory listing for both existence and security. A locale that is turned off in config is indistinguishable from an unknown one (both return 404).
- The ETag on `getLocale` is set on the `Language` object itself; clients are expected to send `If-Match` on subsequent edits.
- The controllers do no authentication of their own; they assume the caller context is already present on the request (provided by the route's middleware as noted in the inline comment).
