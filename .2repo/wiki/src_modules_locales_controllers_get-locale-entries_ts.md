# src/modules/locales/controllers/get-locale-entries.ts

## Purpose

Thin Express controller for `GET /locales/:locale/entries`. It reads and validates query parameters, then delegates to `localeService.searchEntries` to return a flat, paginated list of dictionary entries for one language — the data shape an in-app translation editor works with. It exists to keep HTTP concerns (parsing, validation, response shaping) separate from the domain service.

## Key elements

- **`getLocaleEntries`** *(exported)* — Express handler. Reads `page`, `pageSize`, `text`, `tenant` from the query string via `readInput`, validates pagination against `paginationSchema`, calls `localeService.searchEntries`, and maps the service result to a `successResponse` or `rejectResponse`. All unhandled errors are caught by `catchAs`.

## Relationships

- **`@infrastructure/http/request`** — `readInput` extracts and normalises the query-string parameters for this handler.
- **`@infrastructure/http/schemas`** — `paginationSchema` validates `page` / `pageSize`; a `422` is returned on failure rather than silently clamping.
- **`@infrastructure/http/response`** — `successResponse` and `rejectResponse` build the final Express reply.
- **`@infrastructure/http/controller`** — `rejectValidation` (422 shape) and `catchAs` (generic error catch-and-respond).
- **`../services`** — `localeService.searchEntries` performs the actual lookup; the controller only forwards the validated input.
- **`./routes`** — registers `getLocaleEntries` as the handler for the `GET /locales/:locale/entries` route.

## Notes

- **No caching.** The endpoint is intentionally left uncached because it backs the screen a translator is actively editing; a stale list would silently overwrite in-progress work.
- **Flat list, not the tree.** The nested message tree a client renders is served by a *separate* endpoint (`GET /locales/:locale/messages`). This endpoint returns flat rows only.
- **`tenant` is unvalidated here.** An unrecognised tenant value is passed straight through; the service layer decides whether to drop it (read) or refuse it (write). Do not add tenant allow-listing in the controller.
- **Query params only.** Being a `GET`, there is no request body; any search payload is expected in the query string.
