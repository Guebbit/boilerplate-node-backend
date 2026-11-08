---
source: src/modules/locales/controllers/get-locales.ts
sha256: 808ea551be238847138b800a0733af6ec232426939833d154f376e4eb875d1be
generated_at: 2026-11-08T06:21:27.612542+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locales.ts

## Purpose

Three Express GET controllers that expose the deployment's language capabilities and the API's own filesystem-backed message dictionary. They thin-wrap `localeService` (database-backed, role-scoped) and the i18n filesystem helpers so the routes file can stay declarative.

## Key elements

- **`getLocales`** – `GET /locales`. Calls `localeService.listCapabilities` with the caller's scope and standing, then wraps the result in a `successResponse`. Errors are funneled through `catchAs`.
- **`getLocale`** – `GET /locales/:locale`. Same service call pattern via `readLanguage`; a `refused` result short-circuits to a rejection, otherwise the `Language` payload is returned.
- **`getLocaleDictionary`** – `GET /locales/:locale/dictionary`. Synchronous handler. Validates the locale with `hasServedDictionary` (doubles as existence check *and* path-traversal guard), then returns `{ locale, messages }` read from the filesystem. A disabled or unknown locale yields 404.

## Relationships

- **`src/infrastructure/http/response.ts`** – imports `successResponse` and `rejectResponse` for all three handlers.
- **`src/infrastructure/http/controller.ts`** – imports `catchAs` (error envelope) and `refused` (early rejection check).
- **`src/infrastructure/i18n/index.ts`** – imports `hasServedDictionary`, `readLocaleDictionary`, and `t` (error message lookup).
- **`src/modules/locales/services/index.ts`** – imports `localeService`, the domain service that resolves capabilities and languages from the database.
- **`src/types/index.ts`** – imports the `Language`, `LocaleCapabilities`, and `LocaleDictionary` types used in response generics.
- **`src/modules/locales/routes.ts`** – consumes these three exports as route handlers; also attaches `getAuth` middleware which populates `request.caller` that the controllers read.

## Notes

- `getLocaleDictionary` is the only **synchronous** handler; the other two return a Promise chain. This matters if you add middleware expecting a next/callback.
- The dictionary endpoint deliberately reads the **filesystem**, not the database, so it remains available during a DB outage. The database-backed client-copy route (`GET /locales/:locale/messages`) is a separate, non-redundant endpoint.
- `request.caller` is not set by this file; it is injected by route-level auth middleware (referenced in the `getLocales` comment). Reading it without that middleware would be `undefined`.
- `hasServedDictionary` gates both "is this locale enabled?" and "is this a safe path segment?" in one call—there is no separate 403 for a valid-but-disabled locale.
