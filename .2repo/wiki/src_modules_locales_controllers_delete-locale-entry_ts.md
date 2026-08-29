# src/modules/locales/controllers/delete-locale-entry.ts

## Purpose

Admin-only DELETE handler for `DELETE /locales/:locale/entries/:entryId`. Removes a single key from a single language, then invalidates the local i18n override cache so the deleted string stops being served on this worker immediately.

## Key elements

- **`deleteLocaleEntry(request, response)`** (exported) — Express handler. Delegates to `localeService.deleteEntry(locale, entryId, callerContextOf(request))`, checks the result with `refused`, fires `refreshLocaleOverrides()` (fire-and-forget), and returns an empty success body via `successResponse`. Errors are funneled through `catchAs(response, 'deleteLocaleEntry')`.

## Relationships

- **`src/modules/locales/services/index.ts`** — `localeService.deleteEntry` performs the actual row deletion and returns a permission-aware result.
- **`src/infrastructure/http/controller.ts`** — provides `refused` (short-circuits with a 403-style response) and `catchAs` (serialises thrown errors into the standard error envelope).
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the authenticated caller's identity for audit metadata.
- **`src/infrastructure/http/response.ts`** — `successResponse` sends the standard 200 with no body.
- **`src/infrastructure/i18n/index.ts`** — `refreshLocaleOverrides` re-reads the DB so this worker's in-memory override map drops the deleted key.
- **`src/infrastructure/i18n/overrides.ts`** — underlying storage the refresh targets; referenced indirectly through the index re-export.
- **`src/modules/locales/routes.ts`** — mounts this handler on the DELETE route.

## Notes

- **Data model assumption:** entries are stored one row per *(language, key)* pair. Deleting the Spanish row does not touch the Italian row; the endpoint is intentionally scoped to a single language.
- **No response body:** the deleted key's value is recorded in audit metadata only, not echoed back — consistent with the project-wide "delete returns empty body" convention.
- **`refreshLocaleOverrides()` is not awaited** (`void`). This worker updates immediately; other workers pick up the change on their next scheduled refresh. The rationale mirrors the same pattern in `./write-locale-entries.ts`.
- **Permission gate:** `refused(response, result)` is checked *after* the service call, meaning the service performs its own authz and returns a refusal signal rather than throwing.
