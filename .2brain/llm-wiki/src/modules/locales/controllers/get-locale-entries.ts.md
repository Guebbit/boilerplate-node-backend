---
source: src/modules/locales/controllers/get-locale-entries.ts
sha256: d3dc2ad192aa4298d2f06b1e295565d4e5afd68cadb0e93e79ebf0643b99f8ad
generated_at: 2026-10-15T10:42:22.208592+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-entries.ts

## Purpose
Thin HTTP adapter exposing two GET endpoints for listing locale dictionary entries — all apps or a single app — by delegating to `localeService.searchEntries`. It exists to keep route registration (in `routes.ts`) decoupled from the actual request-parsing and response-shaping logic.

## Key elements
- **`relaxedQuery(generated)`** — internal helper that takes a generated list-query zod schema and (1) replaces `page`/`pageSize` with the coercing infra versions, (2) preprocesses `text` with `blankToUndefined` so an empty `?text=` is treated as "no filter", (3) makes all fields optional via `.partial()`. Serves both list routes because they share the same three filters.
- **`listLocaleEntriesQuerySchema`** — the relaxed query schema for the all-apps route. Strict: a stray `?app=` in the query will 422.
- **`listAppLocaleEntriesQuerySchema`** — the relaxed query schema for the single-app route (app comes from the path, not the query).
- **`listEntries(request, response, schema, app?)`** — shared handler body. Reads query-only input via `readInput(request, { surface: 'list' })`, parses it, calls `localeService.searchEntries(locale, filters)`, and returns `successResponse<LocaleEntriesResponse>`. The `app` parameter is injected into the service call when present.
- **`getLocaleEntries`** (exported) — handles `GET /locales/:locale/entries`; calls `listEntries` without an app filter.
- **`getAppLocaleEntries`** (exported) — handles `GET /locales/:locale/apps/:app/entries`; passes `request.params.app` through.

## Relationships
- **`src/modules/locales/routes.ts`** — registers the two exported handlers as Express route callbacks.
- **`src/modules/locales/services/index.ts`** — provides `localeService.searchEntries`, the sole business-logic call this controller makes.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody`, `refused`, and `catchAs` for the parse-act-respond lifecycle.
- **`src/infrastructure/http/request.ts`** — `readInput` extracts the query-string payload with the `'list'` surface.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the result into the HTTP response.
- **`src/infrastructure/http/schemas.ts`** — `pageSchema`, `pageSizeSchema`, `blankToUndefined` used to build the relaxed query schemas.
- **`src/types/index.ts`** — provides the `LocaleEntriesResponse` wire type used as the generic on `successResponse`.

## Notes
- Query params only — no body is read. A GET carries no search payload (see `docs/theory/request-input.md`).
- Both schemas are **strict** after `.partial()`: any unknown query key (e.g. `?app=` on the all-apps route) produces a 422 rather than being silently ignored.
- Deliberately **not cached**: this endpoint backs the translator's active editing screen.
- `result.data.items` is already the `LocaleEntry` wire shape; no casting is needed (unlike the pre-`createRepository` pattern).
- The nested message tree consumed by clients is a separate endpoint (`GET /locales/:locale/messages`); this controller only handles flat, paginated dictionary rows.
