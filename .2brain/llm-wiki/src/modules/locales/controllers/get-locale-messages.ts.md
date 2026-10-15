---
source: src/modules/locales/controllers/get-locale-messages.ts
sha256: de23d687e41754c03bde948132383ca9d2e1bf8c7b7355882a6a78d6316214b6
generated_at: 2026-10-15T10:42:31.174562+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-messages.ts

## Purpose

Thin HTTP controller (Express handler) for `GET /locales/:locale/messages`. It validates query parameters, delegates to `localeService.readMessages`, and shapes the response. All business logic lives in the service layer; this file is purely an adapter between the HTTP boundary and the locale service.

## Key elements

- **`getLocaleMessages`** (exported) — The Express route handler. Parses `request.query` through the `GetLocaleMessagesQueryParams` Zod schema, calls `localeService.readMessages(locale, query.app)`, then returns `successResponse` or a `refused` status depending on the result. Errors are funneled through `catchAs`.
- **`parseBody(GetLocaleMessagesQueryParams, …)`** — Validates the query string before any service call; if validation fails the function returns early after `parseBody` writes the error response.
- **`refused(response, result)`** — Short-circuits on a domain "refused" outcome (e.g. unknown locale), writing an appropriate HTTP error.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides the `parseBody`, `refused`, and `catchAs` utilities used for input validation, domain-error mapping, and error serialization.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, which wraps service data in the standard success envelope.
- **`src/modules/locales/routes.ts`** — Registers `getLocaleMessages` as the handler for the `GET /locales/:locale/messages` route.
- **`src/modules/locales/services/index.ts`** — Exports `localeService`; this controller calls `readMessages(locale, app?)` on it.
- **`src/types/index.ts`** — Supplies the `LocaleMessages` type used as the generic parameter of `successResponse`.

## Notes

- `?app=` with an empty value is **refused (422)** by design, not treated as "default." Omitting the `app` parameter entirely is the way to request the deployment's default frontend copy.
- The endpoint is public and intended to be cacheable. Cache freshness relies on a `locales` tag being invalidated on every admin write (that invalidation lives elsewhere, not in this file).
- The handler is intentionally free of business logic; any change to message assembly belongs in `localeService.readMessages`.
