---
source: src/modules/locales/controllers/get-locale-entries.ts
sha256: 8b15d5f8f28538126a08defea335d03366fb6fb258e43f5b0d515d77643c7a43
generated_at: 2026-11-08T06:21:06.413427+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-entries.ts

## Purpose

Thin HTTP adapter exposing three admin-facing `GET` endpoints for locale dictionary entries (all-apps list, per-app list, and single-entry fetch). Delegates all business logic to `localeService` and shapes responses with the shared infra response utilities.

## Key elements

- **`relaxedQuery`** – Internal helper that takes a generated Zod query schema and relaxes it: swaps `page`/`pageSize` for the coercing infra schemas, and preprocesses `text` with `blankToUndefined` so an empty `?text=` reads as "no filter" instead of tripping `.min(1)`. Called with `.partial()` at the end.
- **`listLocaleEntriesQuerySchema` / `listAppLocaleEntriesQuerySchema`** – The two concrete query schemas built via `relaxedQuery` (all-apps list vs. per-app list).
- **`listEntries`** – Shared internal handler for both list routes. Parses query via `parseBody` + `readInput`, calls `localeService.searchEntries`, and sends `successResponse`. Accepts an optional `app` param to narrow the search.
- **`getLocaleEntries`** *(exported)* – Controller for `GET /locales/:locale/entries`. Lists every app's entries for one locale.
- **`getAppLocaleEntries`** *(exported)* – Controller for `GET /locales/:locale/apps/:app/entries`. Lists one app's slice; the `app` comes from the path and is merged into the parsed query.
- **`getLocaleEntry`** *(exported)* – Controller for `GET /locales/:locale/apps/:app/entries/:entryId`. Validates `entryId` with `requireId`, calls `localeService.getEntry`, and shapes the result through `presentLocaleEntry`.

## Relationships

- **`@infrastructure/http/controller`** – Imports `parseBody`, `refused`, `catchAs` for the standard request-parse / response / error trio.
- **`@infrastructure/http/ids`** – `requireId` validates the `entryId` path parameter in `getLocaleEntry`.
- **`@infrastructure/http/request`** – `readInput` extracts the query surface from the Express request.
- **`@infrastructure/http/response`** – `successResponse` wraps the service result into the HTTP envelope.
- **`@infrastructure/http/schemas`** – `pageSchema`, `pageSizeSchema`, `blankToUndefined` are composed inside `relaxedQuery`.
- **`../services`** (`src/modules/locales/services/index.ts`) – `localeService.searchEntries` and `localeService.getEntry` are the sole data-fetching calls.
- **`../presenters`** (`src/modules/locales/presenters.ts`) – `presentLocaleEntry` shapes the single-entry wire response (the list path returns the wire shape directly, no presenter needed).
- **`src/modules/locales/routes.ts`** – Registers the three exported controllers to their respective routes.
- **`@types`** – `LocaleEntriesResponse` and `LocaleEntry` are the typed response shapes passed to `successResponse`.

## Notes

- The all-apps list schema is **strict**: a stale `?app=` query param yields a 422 rather than being silently ignored.
- `getLocaleEntries` is **deliberately not cached** — it backs a screen a translator is actively typing into.
- The flat list here is distinct from the nested tree served by `GET /locales/:locale/messages` (a different controller/route for client consumption).
- `searchEntries` returns `LocaleEntry` as its wire shape directly, so the list handler needs no presenter or cast; the single-entry handler **does** call `presentLocaleEntry`.
- `listEntries` returns `Promise.resolve()` early on parse failure (422 already sent) to keep the function signature uniform with the async paths.
