# src/modules/locales/controllers/delete-locale-entry.ts

## Purpose

Thin HTTP adapter for the admin endpoint `DELETE /locales/:locale/entries/:entryId`. It translates the Express request into a `localeService.deleteEntry` call, handles the response, and triggers a locale-override cache refresh. It exists to keep HTTP concerns (param extraction, response shaping, error mapping) out of the service layer.

## Key elements

- **`deleteLocaleEntry`** — The sole export. An Express handler that:
  - Reads `locale` and `entryId` from route params.
  - Calls `localeService.deleteEntry(locale, entryId, callerContextOf(request))`.
  - On refusal, delegates to `refused(response, result)`.
  - On success, fire-and-forgets `refreshLocaleOverrides()` and returns `successResponse(response, undefined)` (empty body).
  - On error, delegates to `catchAs(response, 'deleteLocaleEntry')`.

## Relationships

- **`@infrastructure/http/controller`** (`catchAs`, `refused`) — provides the unified error/refusal mapping so the controller stays free of try/catch boilerplate.
- **`@infrastructure/http/request`** (`callerContextOf`) — extracts caller identity from the request for the audit trail.
- **`@infrastructure/http/response`** (`successResponse`) — shapes the 200/204 response.
- **`@infrastructure/i18n`** (`refreshLocaleOverrides`) — invalidates the in-process override cache after a write; the call is intentionally not awaited.
- **`../services`** (`localeService`) — the domain service that actually deletes the row; this controller is its HTTP projection.
- **`routes.ts`** — registers `deleteLocaleEntry` on the `DELETE /locales/:locale/entries/:entryId` route (admin-guarded upstream).

## Notes

- `refreshLocaleOverrides()` is deliberately **not awaited** (`void …`). The comment references `./write-locale-entries.ts` for the convention: the current worker stops serving stale overrides immediately, while other workers pick up the change on their next scheduled refresh. Do not add `.await` without coordinating that design.
- The success response has **no body** (`undefined`). Clients should rely on the status code and the audit trail, not a payload.
- Deleting one locale's entry does **not** cascade to other locales; each language retains its own row for the same key.
