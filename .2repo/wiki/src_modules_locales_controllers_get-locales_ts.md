# src/modules/locales/controllers/get-locales.ts

## Purpose

HTTP controller layer for the two locale endpoints (`GET /locales` and `GET /locales/:locale`). It bridges the Express request/response cycle to the locale service and the i18n filesystem dictionary, so the API can report which languages it supports and serve its own ~60-key message catalog.

## Key elements

- **`getLocales`** — `GET /locales` handler. Delegates to `localeService.listCapabilities(...)` (scoped by the caller's auth context) and wraps the result in `successResponse`. Catches errors via `catchAs`. The dynamic (database-backed) tier is best-effort: a DB outage degrades gracefully and still returns the static `api`-scoped locales.
- **`getLocaleDictionary`** — `GET /locales/:locale` handler. Validates the param against `listSupportedLocales()` (doubles as 404 + path-traversal guard), then returns `{ locale, messages: readLocaleDictionary(locale) }`. This reads from the filesystem, not the database, so it remains available when the DB-backed `/messages` route is down.

## Relationships

- **`src/infrastructure/http/response.ts`** — source of `successResponse` and `rejectResponse`, the two response helpers both handlers use.
- **`src/infrastructure/http/controller.ts`** — source of `catchAs`, the error-catching wrapper applied in `getLocales`.
- **`src/infrastructure/i18n/index.ts`** — barrel re-export; this file imports `listSupportedLocales`, `readLocaleDictionary`, and `t` from it.
- **`src/infrastructure/i18n/catalog.ts`** — likely home of `listSupportedLocales` and `readLocaleDictionary` (filesystem dictionary access).
- **`src/infrastructure/i18n/context.ts`** — likely home of `t`, the translation function used for the 404 error message.
- **`src/modules/locales/services/index.ts`** — exports `localeService`, whose `listCapabilities` and `callerScope` methods power the `getLocales` handler.
- **`src/modules/locales/routes.ts`** — registers these two handlers on the router and attaches the `getAuth` middleware that populates `request.authContext`.

## Notes

- `getLocaleDictionary` intentionally uses a **separate keyspace** from the client UI copy at `GET /locales/:locale/messages`. This one is filesystem-backed and exists specifically for the outage scenario where the database-backed route is unavailable.
- The locale param check in `getLocaleDictionary` is **not** a regex or allowlist — it calls `listSupportedLocales()` (derived from the directory listing) and does an `.includes()` membership test, which simultaneously rejects unknown locales and blocks path traversal.
- `getLocales` is async-promise-based (`.then/.catch`), while `getLocaleDictionary` is synchronous. They follow different patterns but both end in the same `successResponse`/`rejectResponse` helpers.
