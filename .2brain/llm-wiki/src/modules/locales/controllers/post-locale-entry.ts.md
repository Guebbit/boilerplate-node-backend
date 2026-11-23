---
source: src/modules/locales/controllers/post-locale-entry.ts
source_sha256: 49f3859d02f807103b5580a4939e453514c0e663af435fc1ad8609d2ad39ff3c
context_sha256: 1ef629e14c1e4d6d84ff4476d825dd4abbbc8e80ec5e80b75778fb21c7b6f257
generated_at: 2026-11-22T05:43:20.161426+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/post-locale-entry.ts

## Purpose
Express controller for `POST /locales/:locale/apps/:app/entries` (admin). It adds a single key to an app's locale dictionary: validates the body, delegates creation to the locale service, and replies with a `201 Created` response for the new entry.

## Key elements
- `createTrimmedEntryBody` (module-private): the `CreateLocaleEntryBody` Zod schema (imported from `@api/schemas.zod`) extended so `key` is passed through `trimmedInto(...)`. A blank key therefore fails as a field-level 422 rather than slipping through.
- `createLocaleEntry` (exported): the request handler.
  1. `parseBody` validates `request.body` against the trimmed schema. If it returns a falsy value, the handler returns early (the helper is passed `response`).
  2. Calls `localeService.createEntry(locale, app, body, callerContextOf(request))`.
  3. If `refused(response, result)` is true, it returns early.
  4. Otherwise it maps `result.data` with `presentLocaleEntry` and sends `createdResponse<LocaleEntry>`. The location is `/locales/:locale/apps/:app/entries/:id`.
  5. Errors are handled by `.catch(catchAs(response, 'createLocaleEntry'))`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody`, `refused` and `catchAs`, which handle validation failure, service refusals and unexpected errors.
- `src/infrastructure/http/request.ts`: `callerContextOf` extracts the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `createdResponse` builds the created response with its location.
- `src/infrastructure/http/schemas.ts`: `trimmedInto` supplies the trimming wrapper for the key schema.
- `src/modules/locales/services/index.ts`: exports `localeService`, whose `createEntry` method does the actual creation.
- `src/modules/locales/presenters.ts`: `presentLocaleEntry` converts the service result into the API `LocaleEntry` shape.
- `src/types/index.ts`: supplies the `CreateLocaleEntryRequest` and `LocaleEntry` types.
- `src/modules/locales/routes.ts`: the route table that wires this handler to the endpoint. This is inferred from the graph, since the file itself doesn't show the registration.

## Notes
- The handler does not use `async/await`. It returns a promise chain, and returns `undefined` on the early-exit paths after `parseBody` or `refused` has already written the response.
- Admin-only access is stated in the doc comment. No authorization check is visible in this file, so it is presumably enforced elsewhere, such as in the routes or the service.
