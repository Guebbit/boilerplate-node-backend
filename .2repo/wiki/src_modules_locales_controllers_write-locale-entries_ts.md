# src/modules/locales/controllers/write-locale-entries.ts

## Purpose

Implements the four write HTTP handlers for a locale's entries: create one key, update one value, bulk-replace the entire set (PUT), and bulk-merge a subset (PATCH). The bulk operations are split into two distinct routes rather than a single route with a mode flag so that a mis-set boolean cannot silently empty a dictionary.

## Key elements

- **`createLocaleEntry`** — `POST /locales/:locale/entries`. Validates body via `CreateLocaleEntryBody`, delegates to `localeService.createEntry`, returns 201.
- **`updateLocaleEntry`** — `PUT /locales/:locale/entries/:entryId`. Edits the *value* of an existing entry; the key (`entryId`) is immutable by design.
- **`replaceLocaleEntries`** — `PUT /locales/:locale/entries`. Replaces the whole set; anything stored but not sent is deleted.
- **`mergeLocaleEntries`** — `PATCH /locales/:locale/entries`. Upserts sent entries; everything else is left untouched.
- **`importEntries`** (internal) — Shared handler for the two bulk routes, parameterized by `mode: 'replace' | 'merge'` and `tenant`.
- **`refreshOverrides`** (internal) — Fire-and-forget call to `refreshLocaleOverrides()` invoked after every successful write so the serving worker sees the change immediately.

## Relationships

- **`@infrastructure/http/controller`** — Supplies `catchAs`, `refused`, and `rejectValidation`, the shared error/short-circuit helpers used by every handler.
- **`@infrastructure/http/errors`** — `rejectDatabaseError` is the fallback catch for the two bulk routes.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts caller identity passed to every service call.
- **`@infrastructure/http/response`** — `successResponse` formats the 200/201 reply.
- **`@infrastructure/i18n`** — `refreshLocaleOverrides` re-reads the API's own i18n overlay after a write.
- **`../services`** (`src/modules/locales/services/index.ts`) — `localeService` performs the actual DB work (`createEntry`, `updateEntry`, `importEntries`).
- **`@types`** — Provides the request/tenant/entry type contracts used in handler signatures.
- **`src/modules/locales/routes.ts`** — Registers these four exports as Express route handlers.

## Notes

- **PUT vs PATCH semantics are load-bearing.** PUT is destructive (deletes unsent entries); PATCH is additive. They are separate routes precisely to avoid a single boolean that could flip to "delete everything."
- **Entry key is not editable.** `updateLocaleEntry` changes only the value string. Renaming a key is a delete + create from the caller's perspective.
- **`refreshOverrides` is always called**, even for frontend-tenant writes that cannot affect the overlay. The cost of one extra read is cheaper than threading the tenant through to conditionally skip it.
- **Fire-and-forget refresh** means only the worker that handled the write sees the change instantly; other workers pick it up on their next scheduled refresh cycle.
- All handlers follow the same shape: Zod `safeParse` → service call → `refused` short-circuit → `refreshOverrides` → `successResponse` → `catchAs`/`rejectDatabaseError`.
