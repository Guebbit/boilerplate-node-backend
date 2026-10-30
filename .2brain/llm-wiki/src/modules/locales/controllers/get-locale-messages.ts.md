---
source: src/modules/locales/controllers/get-locale-messages.ts
sha256: d8ae7eeb286119f9b36c9502f081768f779ca44ac9fd2cc54f77dd81b4d91b62
generated_at: 2026-10-29T04:20:08.892709+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-messages.ts

## Purpose

Thin HTTP adapter for the `GET /locales/:locale/messages` endpoint. It validates the query string, delegates to `localeService.readMessages`, and shapes the result into a standard success or refusal response. It exists to keep route wiring and business logic separated from Express request/response handling.

## Key elements

- **`getLocaleMessages`** (exported) — Express handler that:
  - Parses `request.query` against the `GetLocaleMessagesQueryParams` Zod schema (rejects blank `?app=` with 422).
  - Calls `localeService.readMessages(locale, app?, includeInactive?)` where `includeInactive` is `true` when the caller's scope differs from anonymous.
  - Responds via `successResponse<LocaleMessages>` or `refused`; unexpected errors are funnelled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `parseBody`, `refused`, and `catchAs` utilities used for validation, refusal handling, and error catching.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for formatting the happy-path payload.
- **`src/kernel/access/query.ts`** — provides `hasAnonymousReadScope`, used to decide whether the caller is entitled to see inactive (draft) locale entries.
- **`src/modules/locales/services/index.ts`** — exports `localeService`, whose `readMessages` method is the single business call this controller makes.
- **`src/modules/locales/routes.ts`** — registers `getLocaleMessages` on the `GET /locales/:locale/messages` route.
- **`src/types/index.ts`** — supplies the `LocaleMessages` type used as the generic parameter for `successResponse`.

## Notes

- **`?app=` semantics are deliberate:** an *omitted* parameter means "use the deployment default"; a *blank* value (`?app=`) is rejected with 422 rather than coerced. Do not "fix" this to treat empty string as default.
- **Inactive-language visibility** is gated on scope: any caller whose read scope is *not* anonymous gets inactive entries included. There is no per-language permission check here — the service handles that internally.
- **Cache invalidation** is external to this file: admin writes invalidate the `locales` response tag, so a subsequent request reflects the latest data without the controller doing anything special.
