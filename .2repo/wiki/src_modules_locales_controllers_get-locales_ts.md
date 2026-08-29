# src/modules/locales/controllers/get-locales.ts

## Purpose

HTTP controllers for the two locale endpoints (`GET /locales` and `GET /locales/:locale`). They expose which languages the deployment actually supports (a runtime fact that cannot be a static OpenAPI enum) and serve the API's own fallback message dictionary, reading from the filesystem so the copy remains available even when the database is down.

## Key elements

- **`getLocales`** — Handler for `GET /locales`. Delegates to `localeService.listCapabilities` (scoped by the caller's role via `localeService.callerScope`) and returns the resulting capability list. Distinguishes two tiers per locale (`api` = sendable as `Accept-Language`, `app` = downloadable dictionary) instead of a flat tag list.
- **`getLocaleDictionary`** — Handler for `GET /locales/:locale`. Validates the `locale` param against `listSupportedLocales()` (dual-purpose: 404 check **and** path-traversal guard), then returns `{ locale, messages }` from `readLocaleDictionary`. Intentionally reads the filesystem, not the database, so it survives store outages.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the unified error-to-response helper used in `getLocales`'s `.catch`.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` and `rejectResponse`, the thin wrappers around Express `res.json`/`res.status` used by both controllers.
- **`src/infrastructure/i18n/index.ts`** — Barrel import source for `listSupportedLocales`, `readLocaleDictionary`, and `t`.
- **`src/infrastructure/i18n/catalog.ts`** — Implements `listSupportedLocales` (derived from the on-disk dictionary directory) and `readLocaleDictionary` (reads one JSON file by locale).
- **`src/infrastructure/i18n/context.ts`** — Implements `t`, used to produce the error message key in the 404 rejection.
- **`src/modules/locales/routes.ts`** — Wires these two functions to their paths; attaches `getAuth` middleware on `/locales` so `request.authContext` is populated before `getLocales` runs.
- **`src/modules/locales/services/index.ts`** — Exports `localeService`, providing `listCapabilities`, `callerScope`, and (per the doc comment) `readDynamicTier` for the database-backed half.

## Notes

- The locale value in `getLocaleDictionary` is **never** interpolated into a path unchecked: `listSupportedLocales()` is derived from the actual directory listing, so any string not on that list is rejected. This simultaneously handles the 404 case and blocks traversal like `../../etc/passwd`.
- `getLocales` is best-effort on the dynamic (DB-backed) tier: a database outage degrades the response (fewer downloadable languages listed) but never breaks the `api`-scope languages, because the caller asking this question has likely already experienced a failure.
- The API's own ~60 keys served by `getLocaleDictionary` live in a separate keyspace from the client's UI copy (`GET /locales/:locale/messages`); clients are expected to merge them under a reserved namespace (e.g. `api.*`) to avoid collisions.
