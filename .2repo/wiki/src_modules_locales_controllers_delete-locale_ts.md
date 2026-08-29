# src/modules/locales/controllers/delete-locale.ts

## Purpose

Admin-facing DELETE handler for `/locales/:locale`. It removes a language and all strings translated into it, delegates the actual work (and the active-language guard) to the locale service, and refreshes the in-process i18n override cache so the deleted locale stops answering on the current worker.

## Key elements

- **`deleteLocale(request, response)`** — The sole export. Extracts the locale from `request.params.locale`, builds caller context via `callerContextOf`, and calls `localeService.deleteLanguage`. On success it fires `refreshLocaleOverrides()` (unawaited) and returns a bodyless `successResponse`. On refusal (e.g. 409 for an active language) it short-circuits via `refused`. All errors are funneled through `catchAs(response, 'deleteLocale')`.

## Relationships

- **`@infrastructure/http/controller`** — Provides `catchAs` (uniform error → HTTP mapping) and `refused` (early-return when the service signals rejection).
- **`@infrastructure/http/request`** — `callerContextOf` extracts the authenticated caller's identity for the audit trail.
- **`@infrastructure/http/response`** — `successResponse` writes the standard bodyless 200.
- **`@infrastructure/i18n`** — `refreshLocaleOverrides` reloads the worker's in-memory override map so deleted entries stop being served immediately.
- **`../services` (locales services)** — `localeService.deleteLanguage` performs the cascade delete and enforces the active-language guard.
- **`routes.ts`** — Registers `deleteLocale` as the handler for `DELETE /locales/:locale`.

## Notes

- The response intentionally has **no body**; the count of removed entries lives only in the AUDIT record. This is a deliberate API-wide convention for delete endpoints.
- `refreshLocaleOverrides()` is called with `void` (not awaited). The current worker picks up the change immediately; other workers converge on their next scheduled refresh. The same pattern appears in `write-locale-entries.ts`.
- There is no soft delete and no undo. The only safeguard against deleting an active language is the 409 guard inside the service layer — the controller adds none.
