---
source: src/modules/locales/controllers/update-locale-entries.ts
source_sha256: df94494adf7ae0a0200b677f939abbdb3c8785a77c51909496a8feb68ea39b85
context_sha256: 6a90586649b825319c593f9b2255ce776b424dd63be6d69292c6d53fe8071fa2
generated_at: 2026-11-22T05:44:14.469172+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/update-locale-entries.ts

## Purpose
Express controllers for the two bulk imports of an app's locale entries. PUT replaces the whole set (unsent keys are deleted); PATCH merges (unsent keys are untouched, `null` deletes). They are separate methods rather than one route with a flag, so a mis-set boolean can't silently empty a dictionary.

## Key elements
- `importEntries(mode, schema)` (internal): builds an Express handler. It validates the body, normalizes the locale tag, runs `localeService.importEntries` under an If-Match check, and writes the response.
- `replaceLocaleEntries`: `PUT /locales/:locale/apps/:app/entries` (admin). Uses `importEntries('replace', ReplaceLocaleEntriesBody)`.
- `updateLocaleEntries`: `PATCH /locales/:locale/apps/:app/entries` (admin). Uses `importEntries('merge', UpdateLocaleEntriesBody)`. JSON merge patch semantics: a string upserts, `null` deletes, an unnamed key is left alone.

## Relationships
- `src/infrastructure/http/controller.ts`: `parseBody` validates the body against the schema and responds on failure. `refused` short-circuits when the service result is a refusal. `catchAs` handles errors under the operation names `updateLocaleEntries` / `replaceLocaleEntries`.
- `src/infrastructure/http/preconditions.ts`: `withIfMatch(request, tag, fn)` guards the import with the request's precondition, keyed by the normalized tag. `setEtag` writes the ETag on success.
- `src/infrastructure/persistence/revision-plugin.ts`: `EDIT_REVISION` is the key under which the language's new revision is set in the ETag.
- `src/infrastructure/http/request.ts`: `callerContextOf(request)` supplies the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse<LocaleImportResult>` sends the result data.
- `src/modules/locales/services/index.ts` (`localeService`): `normalizeTag` and `importEntries(locale, app, entries, mode, callerContext)` do the actual work.
- `src/types/index.ts`: supplies `LocaleImportResult` and the `ReplaceLocaleEntriesRequest` / `UpdateLocaleEntriesRequest` request types.
- `src/modules/locales/routes.ts`: the file the routes belong to. This file does not import it, so the wiring lives there.

## Notes
- The ETag is keyed by the normalized tag, matching how the repository's fence names the language.
- On success the ETag carries only `EDIT_REVISION` (the new revision), so the next import needs no re-export. The tag's own version, the dictionary counter, is omitted from a PUT answer (RFC 9110 §9.3.4).
- If `parseBody` returns nothing, the handler returns early. The response has already been written.
