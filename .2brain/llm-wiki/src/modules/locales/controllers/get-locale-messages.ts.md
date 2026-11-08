---
source: src/modules/locales/controllers/get-locale-messages.ts
sha256: d8ae7eeb286119f9b36c9502f081768f779ca44ac9fd2cc54f77dd81b4d91b62
generated_at: 2026-11-08T06:21:15.630289+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-messages.ts

## Purpose

Thin Express adapter for `GET /locales/:locale/messages`. It validates the query string, delegates to `localeService.readMessages`, and formats the HTTP response. Exists to keep HTTP concerns (parsing, status codes, error mapping) out of the service layer.

## Key elements

- **`getLocaleMessages(request, response)`** — Exported route handler. Parses `request.query` against the `GetLocaleMessagesQueryParams` Zod schema, calls `localeService.readMessages(locale, app?, includeInactive?)`, then returns `successResponse<LocaleMessages>` or a refusal/error via the shared HTTP helpers.

## Relationships

- **`src/modules/locales/services/index.ts`** — Imports `localeService`; calls `.readMessages()` and reads `.callerScope` for the access-scope check.
- **`src/infrastructure/http/controller.ts`** — Imports `parseBody`, `refused`, and `catchAs` for query validation, refusal short-circuiting, and error serialization.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to send the final JSON payload.
- **`src/kernel/access/query.ts`** — Imports `hasAnonymousReadScope` to decide whether the caller should also receive inactive languages (draft preview for non-anonymous scopes).
- **`src/modules/locales/routes.ts`** — Consumes `getLocaleMessages` as the handler for the `/locales/:locale/messages` route.
- **`src/types/index.ts`** — Imports the `LocaleMessages` type used as the response generic.

## Notes

- **`?app` semantics:** The parameter is *parsed*, not read. A blank value (`?app=`) is refused with 422 rather than silently treated as "default." Omitting the parameter entirely is the explicit way to request the deployment's default frontend copy.
- **Draft preview logic:** The third argument to `readMessages` is `!hasAnonymousReadScope(...)`. Anonymous callers see only active languages; callers with a non-anonymous read scope (e.g. admins) also receive inactive entries.
- **Caching:** The endpoint is intended to be public and cacheable. The `locales` cache tag is invalidated on every admin write, so edits appear on the next request.
