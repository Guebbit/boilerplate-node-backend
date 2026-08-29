# src/modules/locales/controllers/get-locale-entries.ts

## Purpose

Controller handler for the admin endpoint `GET /locales/:locale/entries`. It serves the flat, paginated row list that a translation editing screen displays. It exists separately from the nested `messages` endpoint so each route answers exactly one shape of data and the two are named for what they are.

## Key elements

- **`getLocaleEntries`** (default export) — Express handler. Reads `page`, `pageSize`, `text`, and `tenant` from the query string via `readInput` (surface `'list'`), validates pagination with `paginationSchema`, delegates to `localeService.searchEntries`, and maps the service result to a success or error HTTP response.

## Relationships

- **`src/infrastructure/http/request.ts`** — `readInput` extracts query-string parameters from the Express `Request`.
- **`src/infrastructure/http/schemas.ts`** — `paginationSchema` validates `page`/`pageSize` (invalid values produce a 422, not a silent clamp).
- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` shape the HTTP reply.
- **`src/infrastructure/http/controller.ts`** — `rejectValidation` (422 on schema failure) and `catchAs` (catch-all error handler tagged with the route name).
- **`src/modules/locales/services/index.ts`** — `localeService.searchEntries` performs the actual lookup; the controller is a thin I/O wrapper.
- **`src/modules/locales/routes.ts`** — registers `getLocaleEntries` on the `GET /locales/:locale/entries` (admin) path.

## Notes

- **No caching by design.** Every other locale read endpoint is cached for ~1 hour; this one is deliberately uncached because it backs a live editing screen where a stale page would mean overwriting a value another translator already changed. The saved cost is a single indexed query against an admin-only collection.
- **Query-string only.** The handler reads input with `surface: 'list'` and never touches `request.body`; there is no `POST …/entries/search` to carry a body, so no body schema is declared.
- **`tenant` pass-through.** The controller forwards `tenant` as-typed. Whether an unrecognised tenant is dropped or refused is decided by the service layer (stated in `services/languages.ts`), not here.
