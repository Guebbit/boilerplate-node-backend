---
source: src/modules/locales/controllers/delete-locale.ts
source_sha256: c18c2089aa065da7c1d1279de123e6180b2fcd4db36a3bfed4f7de38935ba126
context_sha256: 58c793460d047ce61149f4822959739d3fd3cf56fa7e9f78733e273ba1dbc487
generated_at: 2026-11-22T05:42:00.914126+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/delete-locale.ts

## Purpose
Controller for `DELETE /locales/:locale` (admin). It is a thin HTTP adapter over `localeService.removeLanguage`, which removes a language and every string translated into it. On success it returns an empty 204 response.

## Key elements
- `deleteLocale(request, response)` — the only export. Calls `localeService.removeLanguage(request.params.locale, callerContextOf(request))` and handles the outcome:
  - If `refused(response, result)` is true, it returns without further action (the refusal response is written by that helper).
  - Otherwise it responds with `noContentResponse(response)`.
  - Rejections are handled by `.catch(catchAs(response, 'deleteLocale'))`.

## Relationships
- `src/infrastructure/http/controller.ts` — provides `refused` (turns a refused service result into a response) and `catchAs` (error handler labelled `'deleteLocale'`).
- `src/infrastructure/http/request.ts` — provides `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — provides `noContentResponse`, used for the success reply.
- `src/modules/locales/services/index.ts` — exports `localeService`; `removeLanguage` holds the business logic.
- `src/modules/locales/routes.ts` — the route layer that wires this handler to `DELETE /locales/:locale`.

## Notes
- The 409 refusal when the language is still active is enforced in the service, next to the cascade it protects, not in this controller.
- The response has no body. The number of entries removed goes into the audit trail rather than the response.
- Per the doc comment, the service refreshes the overlay on success (see `src/modules/locales/services/overlay.ts`), so the controller does nothing for that.
