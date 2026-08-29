# src/modules/locales/controllers/write-locale-entries.ts

## Purpose

HTTP controller handlers for the four mutation routes on a locale's entries: create one key, update one key's value, bulk-replace the entire set (PUT), and bulk-merge/upsert a subset (PATCH). It exists to translate validated request bodies into `localeService` calls and shape the responses, keeping the semantic split between replace and merge explicit at the method level rather than a boolean flag.

## Key elements

- **`createLocaleEntry`** — `POST /locales/:locale/entries`. Validates body with `CreateLocaleEntryBody.safeParse`, delegates to `localeService.createEntry`, returns `201`.
- **`updateLocaleEntry`** — `PUT /locales/:locale/entries/:entryId`. Validates with `UpdateLocaleEntryBody.safeParse`, delegates to `localeService.updateEntry`. The key (`entryId`) is path-only and not editable.
- **`replaceLocaleEntries`** — `PUT /locales/:locale/entries`. Bulk replace; keys stored but absent from the payload are deleted. Validates with `ReplaceLocaleEntriesBody.safeParse`.
- **`mergeLocaleEntries`** — `PATCH /locales/:locale/entries`. Bulk upsert; stored keys not in the payload are left untouched. Validates with `MergeLocaleEntriesBody.safeParse`.
- **`importEntries`** (private) — Shared implementation for the two bulk routes; differs only in the `mode` argument (`'replace'` | `'merge'`) passed to `localeService.importEntries`.
- **`refreshOverrides`** (private) — Fire-and-forget wrapper around `refreshLocaleOverrides()`; called after every successful write to refresh the current worker's i18n overlay without blocking the response.

## Relationships

- **`src/modules/locales/services/index.ts`** — Every handler delegates its business logic to `localeService` (`createEntry`, `updateEntry`, `importEntries`).
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (uniform error→response mapping), `refused` (short-circuit for rejected results), and `rejectValidation` (zod error → 4xx).
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError`, used by the shared `importEntries` helper for database-level failures.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, extracted and forwarded to every service call for audit/authorization context.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for shaping 200/201 replies.
- **`src/infrastructure/i18n/index.ts`** — Source of `refreshLocaleOverrides`, the overlay-cache invalidation triggered after each write.
- **`src/types/index.ts`** — Supplies the request/response type aliases (`CreateLocaleEntryRequest`, `LocaleEntryInput`, `LocaleTenant`, etc.) used in Express route signatures.
- **`src/modules/locales/routes.ts`** — Binds these exported handlers to their respective method+path combinations.

## Notes

- **PUT vs PATCH is load-bearing.** `PUT` (replace) deletes unmentioned keys; `PATCH` (merge) never deletes. The distinction is enforced by the HTTP method, not a body flag, so a client cannot accidentally pick the wrong one. Contract tests in `tests/contract/` assert the pair together.
- **`refreshOverrides` is intentionally not awaited.** The 200 returns before the overlay is re-read. Other workers pick up the change on their next scheduled refresh. This is called even for frontend-tenant writes to keep the code path uniform, accepting one redundant query.
- **All four handlers follow the same shape:** zod `safeParse` → service call → `refused` guard → `refreshOverrides()` → `successResponse`. Error handling is delegated to `catchAs` (single-key routes) or `rejectDatabaseError` (bulk routes).
