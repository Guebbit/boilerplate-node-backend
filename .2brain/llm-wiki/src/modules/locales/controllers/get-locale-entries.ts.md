---
source: src/modules/locales/controllers/get-locale-entries.ts
sha256: be4631a8e32a1d30fa89a67988708687b3f1f3774e3065c5ae388efc8b848b90
generated_at: 2026-11-14T20:17:23.518789+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-entries.ts

## Purpose

Thin HTTP adapter for the three admin GET routes that read locale dictionary entries: listing all apps' entries for a language, listing one app's slice, and fetching a single entry by id. Translates Express requests into `localeService.searchEntries` / `localeService.getEntry` calls and shapes the responses back.

## Key elements

- **`relaxedQuery(generated)`** (internal) — Extends a generated zod query schema with the coercing `page`/`pageSize` infra pair and a `blankToUndefined` preprocessor on `text`, then marks the whole schema `.partial()`. Shared by both list routes.
- **`listLocaleEntriesQuerySchema`** / **`listAppLocaleEntriesQuerySchema`** (internal) — The concrete query schemas for the two list endpoints, built via `relaxedQuery`.
- **`listEntries(request, response, schema, app?)`** (internal) — Single reader for both list routes. Parses query params, calls `localeService.searchEntries`, sets an ETag from the language's `revision`, and returns the list. The `app` parameter is optional; when absent the search spans all apps.
- **`getLocaleEntries`** (exported) — Controller for `GET /locales/:locale/entries`. Delegates to `listEntries` with the all-apps schema. Deliberately not cached (active translation screen).
- **`getAppLocaleEntries`** (exported) — Controller for `GET /locales/:locale/apps/:app/entries`. Delegates to `listEntries`, passing `request.params.app`.
- **`getLocaleEntry`** (exported) — Controller for `GET /locales/:locale/apps/:app/entries/:entryId`. Validates the id via `requireId`, calls `localeService.getEntry`, and passes the result through `presentLocaleEntry`. Returns a uniform 404 for unknown id, wrong app, or wrong language.

## Relationships

- **`@infrastructure/http/controller`** — Imports `catchAs`, `parseBody`, `refused` for the standard parse → call → refuse/error cycle.
- **`@infrastructure/http/ids`** — Imports `requireId` to validate and extract the `entryId` path param in the single-entry route.
- **`@infrastructure/http/preconditions`** — Imports `setEtag` to stamp the list response with the language revision.
- **`@infrastructure/http/request`** — Imports `readInput` to extract query parameters from the Express request.
- **`@infrastructure/http/response`** — Imports `successResponse` to emit the final 200 body.
- **`@infrastructure/http/schemas`** — Imports `blankToUndefined`, `pageSchema`, `pageSizeSchema` for query-param coercion.
- **`@types`** — Imports `LocaleEntriesResponse` and `LocaleEntry` as the response wire types.
- **`../services`** (`src/modules/locales/services/index.ts`) — Imports `localeService` and calls `searchEntries` / `getEntry`.
- **`../presenters`** (`src/modules/locales/presenters.ts`) — Imports `presentLocaleEntry` to shape the single-entry response (not used for the list, whose wire shape is already final).
- **`src/modules/locales/routes.ts`** — Registers the three exported handlers as route callbacks.

## Notes

- The list endpoints do **not** run the result through a presenter: `searchEntries` already returns `LocaleEntry[]` in wire form, so `result.data.items` is used directly.
- The single-entry endpoint **does** call `presentLocaleEntry` — the two paths differ in shaping.
- `text` is preprocessed with `blankToUndefined` so `?text=` (empty string) means "no filter" instead of tripping the generated schema's `.min(1)`.
- The all-apps list schema is strict, meaning a stale `?app=` query param yields a 422 rather than being silently ignored.
- The list ETag is set from `result.data` (the language's `revision` field), which is the same value an import's `If-Match` compares against.
