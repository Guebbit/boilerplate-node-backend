---
source: src/modules/locales/controllers/delete-locale-entry.ts
source_sha256: cba31a55c6f9c95b4aa2fa7b1a9933406b3b929636899a656fc2bec1a8f3c0e9
context_sha256: 784c2effa50d508e86a41987222ab438552a511abf1a751b3c7cbf1269713e2a
generated_at: 2026-11-22T05:41:52.161555+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/delete-locale-entry.ts

## Purpose
Express controller for `DELETE /locales/:locale/apps/:app/entries/:entryId` (admin). It is a thin HTTP adapter over `localeService.removeEntry`: it removes one key from one language only, leaving other languages' rows for that key intact. It responds with no body; the removed key is recorded in the audit trail instead.

## Key elements
- `deleteLocaleEntry(request, response)` — the exported handler.
  - Validates `entryId` with `requireId`, using the not-found message key `locales.error-entry-not-found` and param name `entryId`. If validation fails, it returns `Promise.resolve()` and stops.
  - Calls `localeService.removeEntry(locale, app, entryId, callerContextOf(request))`.
  - If `refused(response, result)` reports the service refused the request, it returns without further action. Otherwise it sends `noContentResponse(response)`.
  - Any rejection is handled by `catchAs(response, 'deleteLocaleEntry')`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `refused` (checks the service result and writes a refusal response) and `catchAs` (error handler labelled with the controller name).
- `src/infrastructure/http/ids.ts` — `requireId` parses and validates the `entryId` route param.
- `src/infrastructure/http/request.ts` — `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — `noContentResponse` sends the success response.
- `src/modules/locales/services/index.ts` — provides `localeService`, whose `removeEntry` does the actual removal. Per the source comment, the service itself refreshes the overlay on success.
- `src/modules/locales/routes.ts` — mounts this handler on the DELETE route.

## Notes
- The handler always returns a Promise (including on the early-exit path), so callers can treat it uniformly.
- It has no business logic of its own; authorization, removal, audit logging and overlay refresh all happen elsewhere (the "(admin)" restriction is stated in the doc comment, not enforced in this file).
