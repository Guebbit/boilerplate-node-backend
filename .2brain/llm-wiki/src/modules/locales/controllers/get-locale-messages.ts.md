---
source: src/modules/locales/controllers/get-locale-messages.ts
source_sha256: f1634edcb30736e223021c3f083b4681f764e247dc2606d06455919f93e7e1a1
context_sha256: 94a61918c76126eb68b19475134fd85d604b226e9ed18e34134652db91d49125
generated_at: 2026-11-22T05:42:40.016283+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/get-locale-messages.ts

## Purpose
Express controller for `GET /locales/:locale/messages`. It is a thin HTTP adapter over `localeService.readMessages`. It returns the client's dictionary for one language, nested to match `GET /locales/:locale`. The endpoint is public and cacheable.

## Key elements
- `getLocaleMessages(request, response)`: the only export.
  - Parses `request.query` with `GetLocaleMessagesQueryParams` via `parseBody`. If parsing fails, it returns early (`parseBody` is passed `response`).
  - Calls `localeService.readMessages(request.params.locale, query.app, includeInactive)`.
  - If `refused(response, result)` is true, it returns without further handling.
  - Otherwise it sets the `Content-Language` header to `result.data.locale` and responds with `successResponse<LocaleMessages>`.
  - Rejections go to `catchAs(response, 'getLocaleMessages')`.

## Relationships
- `src/infrastructure/http/controller.ts` supplies `parseBody` (query validation), `refused` (service-result refusal handling) and `catchAs` (error handler).
- `src/infrastructure/http/response.ts` supplies `successResponse`.
- `src/kernel/access/query.ts` supplies `hasAnonymousReadScope`, which decides whether the caller also sees inactive languages.
- `src/modules/locales/services/index.ts` supplies `localeService`, which holds the actual logic.
- `src/types/index.ts` supplies the `LocaleMessages` type.
- `src/modules/locales/routes.ts` is a neighbor in the graph, and the route `GET /locales/:locale/messages` presumably wires this handler. The file content doesn't show that wiring.

## Notes
- **`app` query param:** it is parsed rather than read directly, so `?app=a&app=b` (an array) and `?app=` (an empty string) are not treated as valid apps. A blank value is refused with a 422 and is not read as "the default". To get the default app, omit the parameter. When it is omitted, the deployment's default app is used.
- **Draft preview:** the third argument to `readMessages` is `!hasAnonymousReadScope(...)`. A caller whose read scope differs from an anonymous stranger's (`display:Locale`) also gets inactive languages.
- **Cache invalidation:** per the doc comment, every admin write clears `locale:<code>` and `locales:manifest`, so edits are visible on the next request.
- **`Content-Language`:** it is set in the controller because the route is language-neutral and no middleware labels it.
