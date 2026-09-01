# src/modules/locales/controllers/delete-locale.ts

## Purpose

Thin HTTP adapter for `DELETE /locales/:locale` (admin). Translates the Express request into a `localeService.deleteLanguage` call, handles the 409 guard response, triggers a locale-overrides refresh, and formats the success/error replies.

## Key elements

- **`deleteLocale`** (exported) — The sole controller function. Reads `:locale` from route params, obtains caller context via `callerContextOf(request)`, delegates deletion to `localeService.deleteLanguage`, then:
  - Short-circuits with a 409 if `refused(response, result)` is true (active-language guard lives in the service).
  - Fires `void refreshLocaleOverrides()` to invalidate the in-process override cache for this worker.
  - Returns `successResponse(response, undefined)` — no body on success.
  - Catches errors through `catchAs(response, 'deleteLocale')`.

## Relationships

- **`@infrastructure/http/controller`** — supplies the `catchAs` and `refused` helpers used for uniform error/conflict handling.
- **`@infrastructure/http/request`** — supplies `callerContextOf`, extracted from the incoming request and passed to the service.
- **`@infrastructure/http/response`** — supplies `successResponse` for the 200 reply.
- **`@infrastructure/i18n`** — supplies `refreshLocaleOverrides`, called (not awaited) after a successful delete so this worker's override cache stops serving the removed language.
- **`../services`** (`localeService`) — performs the actual cascade delete; owns the "still active → 409" guard and records the removed-entry count for the audit trail.
- **`src/modules/locales/routes.ts`** — registers `deleteLocale` on the `DELETE /locales/:locale` route.

## Notes

- The 409 conflict guard is **not** in this file; it lives inside `localeService.deleteLanguage`. This controller only maps the returned refusal to an HTTP response.
- `refreshLocaleOverrides()` is deliberately **not awaited**. The comment notes this stops the override from answering *on this worker immediately*; other workers pick up the change on their next scheduled refresh. The same pattern is referenced in `write-locale-entries.ts`.
- No success body is sent (`undefined`); the number of deleted entries is recorded by the service in the audit trail, not echoed to the caller.
