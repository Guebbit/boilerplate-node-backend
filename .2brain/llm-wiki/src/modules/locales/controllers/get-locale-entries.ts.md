---
source: src/modules/locales/controllers/get-locale-entries.ts
source_sha256: bb4882667faa84088d2256fa628f572de295488705f59d7da105434549078615
context_sha256: 52f9e34b159077fd4d38294b7526e09c2bc76ce61f60937dcffd9094b1588c7e
generated_at: 2026-11-22T05:42:27.846402+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/get-locale-entries.ts

## Purpose
Express controllers for the admin read endpoints over a language's dictionary entries: the flat paginated lists (`GET /locales/:locale/entries` and `GET /locales/:locale/apps/:app/entries`) and the single-entry read. They are thin HTTP adapters over `localeService`: validate input, call the service, and shape the response.

## Key elements
- **`relaxedQuery(generated)`** (private): relaxes a generated list-query schema. `page` and `pageSize` become the coercing infra schemas, `text` goes through `blankToUndefined` so `?text=` means "no filter", and the result is `.partial()`.
- **`listLocaleEntriesQuerySchema` / `listAppLocaleEntriesQuerySchema`**: `relaxedQuery` applied to the generated `ListLocaleEntriesQueryParams` and `ListAppLocaleEntriesQueryParams`. The all-apps schema is strict, so a stray `?app=` gives a 422.
- **`listEntries(request, response, schema, app?)`** (private): the reader both list routes share. It:
  - parses the query with `parseBody(schema, readInput(request, { surface: 'list' }), response)`;
  - calls `localeService.searchEntries(locale, parsed)`, adding `app` from the path when one is given;
  - returns early if `refused(response, result)`;
  - calls `setEtag(response, result.data)`, then `successResponse<LocaleEntriesResponse>`;
  - routes errors through `catchAs(response, 'getLocaleEntries')`.
- **`getLocaleEntries`**: lists every app's rows for one language. It is deliberately not cached, because translators are actively editing this screen.
- **`getAppLocaleEntries`**: lists one app's slice, taking `app` from `request.params.app`. This is the same address the writes target, so a PUT there replaces exactly what this lists.
- **`getLocaleEntry`**: reads one entry. It validates `entryId` with `requireId` (not-found key `locales.error-entry-not-found`), calls `localeService.getEntry(locale, app, entryId)`, and responds with `presentLocaleEntry(result.data)` as a `LocaleEntry`. Errors go through `catchAs(response, 'getLocaleEntry')`.

## Relationships
- `infrastructure/http/controller`: supplies `parseBody`, `refused` and `catchAs`, the shared controller plumbing.
- `infrastructure/http/request`: `readInput` reads the query (`surface: 'list'`).
- `infrastructure/http/schemas`: `pageSchema`, `pageSizeSchema` and `blankToUndefined` are used to relax the query.
- `infrastructure/http/preconditions`: `setEtag` tags list responses.
- `infrastructure/http/response`: `successResponse` writes the success payload.
- `infrastructure/http/ids`: `requireId` validates `entryId`.
- `../services` (`localeService`): `searchEntries` and `getEntry` do the actual work.
- `../presenters`: `presentLocaleEntry` maps a single entry to its wire shape.
- `@types`: `LocaleEntriesResponse` and `LocaleEntry` type the responses.
- `routes.ts` is the neighbor that wires these handlers to paths.

## Notes
- List results need no presenter. `searchEntries` already returns `LocaleEntry` as its wire type, so `result.data` is sent as-is. The single-entry read does go through `presentLocaleEntry`.
- The ETag on both lists is derived from the language's `revision`. An import's `If-Match` compares against this tag (see `src/modules/locales/services/entries.ts#searchEntries`).
- `getLocaleEntry` answers the same 404 for an entry belonging to another app or language, an unknown id and a malformed id.
- The `GET` handlers read query params only, since a GET has no body.
- Handlers return a `Promise`. They return `Promise.resolve()` after a failed parse or ID check, because the error response has already been sent.
