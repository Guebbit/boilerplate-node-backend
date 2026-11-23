---
source: src/modules/locales/controllers/put-locale-entry.ts
source_sha256: 698e0319b68671ce7b1009231a236be3832fde26acf4fa465161e6dee9caea0d
context_sha256: 6135d82bc512e7b78a2b78e8349df4f6a53797262371287f0518e3d76c758476
generated_at: 2026-11-22T05:43:46.026988+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/put-locale-entry.ts

## Purpose
Express controller for `PUT /locales/:locale/apps/:app/entries/:entryId` (admin). It edits the value of a single locale entry. The app is a path segment, so a PUT replaces exactly what the GET on the same URI lists.

## Key elements
- `replaceLocaleEntry(request, response)` is the only export. It is a request handler typed with params `{ locale, app, entryId }` and a `ReplaceLocaleEntryRequest` body.
  1. It validates `entryId` with `requireId`. A bad id gets the `locales.error-entry-not-found` response.
  2. It validates the body with `parseBody(ReplaceLocaleEntryBody, ...)`.
  3. It calls `localeService.updateEntry(locale, app, entryId, body, callerContextOf(request))`.
  4. If `refused(response, result)` is true, it stops, because the refusal response has already been sent. Otherwise it sends `successResponse<LocaleEntry>` with `presentLocaleEntry(result.data)`.
  5. Rejections are handled by `catchAs(response, 'replaceLocaleEntry')`.

## Relationships
- `src/infrastructure/http/controller.ts` supplies `parseBody`, `refused` and `catchAs`, which handle validation, service refusals and errors.
- `src/infrastructure/http/ids.ts` supplies `requireId`, which parses `entryId`.
- `src/infrastructure/http/request.ts` supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` supplies `successResponse`, which sends the success payload.
- `src/modules/locales/services/index.ts` supplies `localeService`, whose `updateEntry` does the actual update.
- `src/modules/locales/presenters.ts` supplies `presentLocaleEntry`, which shapes the result into a `LocaleEntry`.
- `src/types/index.ts` supplies the `LocaleEntry` and `ReplaceLocaleEntryRequest` types.
- `src/modules/locales/routes.ts` is the route registry. It presumably mounts this handler, though the file itself does not show that.

## Notes
- The entry key cannot be edited. It is the identity clients look strings up by, so changing it is a delete plus an add, not an update.
- There is no `If-Match` handling. The doc comment gives the reason as "one string, edited from the list".
- Every early exit (`if (!entryId) return;`, `if (!body) return;`, `refused`) relies on the helper having already written the response. The handler does not respond itself in those cases.
- The body schema `ReplaceLocaleEntryBody` is imported from `@api/schemas.zod`.
- The "(admin)" restriction is stated only in the doc comment. This file does not enforce it, so it must be applied elsewhere, for example in routing or the service.
