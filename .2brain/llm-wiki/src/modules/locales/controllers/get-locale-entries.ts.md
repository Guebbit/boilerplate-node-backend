---
source: src/modules/locales/controllers/get-locale-entries.ts
sha256: 8b15d5f8f28538126a08defea335d03366fb6fb258e43f5b0d515d77643c7a43
generated_at: 2026-10-29T04:19:59.727854+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-entries.ts

## Purpose

Thin HTTP controller for three admin GET routes that read locale dictionary entries: list all entries for a language, list one app's slice of a language, and fetch a single entry by ID. Serves as the read counterpart to the PUT/POST write routes at the same addresses, delegating all domain logic to `localeService`.

## Key elements

- **`relaxedQuery`** (local) — Takes a generated Zod list-query schema and extends it with the coercing `pageSchema`/`pageSizeSchema` pair and a `blankToUndefined` preprocess on `text`, then marks it `.partial()`. One builder serves both list routes.
- **`listLocaleEntriesQuerySchema`** / **`listAppLocaleEntriesQuerySchema`** — The two concrete query schemas produced by `relaxedQuery`. The all-apps schema is strict, so a stray `?app=` yields 422.
- **`listEntries`** (local, shared) — Single implementation behind both list routes. Parses query via `parseBody` + `readInput`, calls `localeService.searchEntries`, and returns the result through `successResponse`. Accepts an optional `app` string to narrow the query.
- **`getLocaleEntries`** (exported) — Handler for `GET /locales/:locale/entries`. Delegates to `listEntries` with the all-apps schema.
- **`getAppLocaleEntries`** (exported) — Handler for `GET /locales/:locale/apps/:app/entries`. Delegates to `listEntries` with the one-app schema, passing `request.params.app`.
- **`getLocaleEntry`** (exported) — Handler for `GET /locales/:locale/apps/:app/entries/:entryId`. Validates `entryId` via `requireId`, calls `localeService.getEntry`, and formats the single row with `presentLocaleEntry`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `parseBody`, `refused`, and `catchAs`, the shared request-parsing / error-handling / rejection primitives used by every handler here.
- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `entryId` path param (malformed or missing → 404).
- **`src/infrastructure/http/request.ts`** — `readInput` extracts the query surface from the Express request.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the service result onto the HTTP response.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema`, `pageSizeSchema`, and `blankToUndefined` used to build the relaxed query schemas.
- **`src/modules/locales/services/index.ts`** — `localeService.searchEntries` and `localeService.getEntry` are the domain calls this controller wraps.
- **`src/modules/locales/presenters.ts`** — `presentLocaleEntry` shapes a single entry for the wire (not needed for list routes, where `LocaleEntry` is already the wire shape).
- **`src/modules/locales/routes.ts`** — Registers these three exported handlers at their respective paths.
- **`src/types/index.ts`** — Source of the `LocaleEntriesResponse` and `LocaleEntry` wire types used in response generics.

## Notes

- **No caching by design.** The list endpoints feed a translation editor screen where a user is actively typing; the code comments call this out explicitly.
- **List vs. messages routes are separate.** The flat, paginated entry list here is *not* the nested tree a client app consumes; that is served by `GET /locales/:locale/messages`.
- **List routes use query params only.** There is no request body; `readInput` is called with `{ surface: 'list' }`.
- **Strictness asymmetry.** The all-apps schema rejects a stray `?app=` (422), while the one-app schema does not include `app` in the query at all (it comes from the path).
- **Single-entry 404 uniformity.** A wrong app, wrong language, unknown ID, or malformed ID all produce the same 404 via `requireId` + `localeService.getEntry` rejection.
