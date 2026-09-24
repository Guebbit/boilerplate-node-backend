---
source: src/modules/locales/controllers/write-locale-entries.ts
sha256: 1bb18b33adf758cc960c63bfe1e01d48cffe0e4bd9c7e396e4d9861a02926c6f
generated_at: 2026-09-23T18:49:16.346012+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/write-locale-entries.ts

## Purpose
HTTP handler layer for the four write routes on a language's locale entries: single-key create and update, plus bulk replace (PUT) and merge (PATCH). Each handler validates the body with a Zod schema, delegates to `localeService`, and refreshes the i18n override cache on success.

## Key elements
- **`createLocaleEntry`** — `POST /locales/:locale/entries`. Validates with `CreateLocaleEntryBody`, calls `localeService.createEntry`, returns 201 with the entry.
- **`updateLocaleEntry`** — `PUT /locales/:locale/entries/:entryId`. Validates with `UpdateLocaleEntryBody`, calls `localeService.updateEntry`. The key is immutable (identity); only the value changes.
- **`replaceLocaleEntries`** — `PUT /locales/:locale/entries`. Validates with `ReplaceLocaleEntriesBody`, delegates to the shared `importEntries` helper in `'replace'` mode. Anything not in the payload is deleted.
- **`mergeLocaleEntries`** — `PATCH /locales/:locale/entries`. Validates with `MergeLocaleEntriesBody`, delegates to `importEntries` in `'merge'` mode. Upserts sent keys; never deletes.
- **`importEntries`** (private) — Common bulk handler shared by replace/merge; parameterised by `mode`, `tenant`, and `entries`.
- **`refreshOverrides`** (private) — Fire-and-forget call to `refreshLocaleOverrides()` so the editing worker sees the change immediately.

## Relationships
- **`src/modules/locales/services/index.ts`** — All four handlers delegate business logic to `localeService` (create, update, import entries).
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, `refused`, and `rejectValidation` for uniform error and rejection handling.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to extract auth/tenant context passed into service calls.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for consistent JSON success envelopes.
- **`src/infrastructure/i18n/index.ts`** — Exports `refreshLocaleOverrides`, called after every successful write to update the local override cache.
- **`src/modules/locales/routes.ts`** — Upstream consumer that binds these exported handlers to their Express routes.
- **`src/types/index.ts`** — Source of the domain types (`LocaleEntry`, `LocaleEntryInput`, `LocaleImportResult`, request-body types, `LocaleTenant`).

## Notes
- The bulk routes are two separate methods (PUT/PATCH) rather than one route with a mode flag, so a mis-set boolean can't silently empty a dictionary.
- `result.data.toJSON()` is required before sending the entry back: the Mongoose model stores `_id` and native `Date`, while the wire type `LocaleEntry` expects `id` and ISO strings.
- `refreshOverrides` is called for frontend-tenant writes as well, even though those writes cannot affect the API overlay — the cost of the unconditional call is cheaper than threading tenant through.
- Error handling is promise-chain (`.then`/`.catch`) rather than async/await; `catchAs` tags the handler name for logging.
