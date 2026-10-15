---
source: src/modules/locales/controllers/get-entity-translations.ts
sha256: 321d7c286890e02c2b42318e21d2b5e6de68080732b6fbb0348b13febfacce97
generated_at: 2026-10-15T10:42:05.054975+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-entity-translations.ts

## Purpose

Thin HTTP adapter for `GET /locales/translations/:entityType/:id`. It validates the path params, delegates to `localeService.getEntityTranslations`, and shapes the HTTP response — keeping all translation-fetching logic in the service layer.

## Key elements

- **`getEntityTranslations(request, response)`** — the sole export; the Express route handler. Reads `entityType` and `id` from `request.params`, validates the ID via `requireId`, calls the service, and returns either a success payload or a structured error.
- **`requireId`** (from `@infrastructure/http/ids`) — validates the `:id` param. On failure it sends a 404 with a localized message produced by `t('locales.error-entity-not-found', …)` and the handler returns early.
- **`refused` / `catchAs` / `successResponse`** (from `@infrastructure/http/controller` and `response`) — standard helpers that translate service results and thrown errors into consistent HTTP responses. `refused` is checked *before* `successResponse`, allowing the service to signal a policy-level rejection.
- **`localeService`** (from `../services`) — the domain service whose `getEntityTranslations(entityType, id)` method is the sole business-logic call.

## Relationships

- **`src/modules/locales/routes.ts`** — registers this handler on the `GET /locales/translations/:entityType/:id` path (admin-scoped per the doc comment).
- **`src/modules/locales/services/index.ts`** — barrel that re-exports `localeService`; this file imports from it rather than reaching into a deeper path.
- **`src/infrastructure/http/response.ts`** — source of `successResponse`.
- **`src/infrastructure/http/controller.ts`** — source of `catchAs` and `refused`.
- **`src/infrastructure/http/ids.ts`** — source of `requireId`.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — source of the `t` function used to build the localized not-found message.

## Notes

- The "(admin)" tag in the JSDoc implies an auth/role guard is applied upstream (in `routes.ts` or middleware); this controller contains no authorization logic itself.
- The `notFound` option passed to `requireId` is a **function returning a string** (not a static string) so the i18n lookup is deferred until the 404 is actually triggered, keeping `entityType` and `entityId` in scope.
- `refused(response, result)` is checked before `successResponse`; the service contract distinguishes a "refused" outcome from a plain success, and this controller treats it as a short-circuit without entering the success path.
