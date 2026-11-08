---
source: src/modules/locales/controllers/get-entity-translations.ts
sha256: 321d7c286890e02c2b42318e21d2b5e6de68080732b6fbb0348b13febfacce97
generated_at: 2026-11-08T06:20:46.368827+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-entity-translations.ts

## Purpose

HTTP controller for `GET /locales/translations/:entityType/:id` (admin). It validates the entity ID, delegates to `localeService.getEntityTranslations`, and shapes the result into a standard success or refusal response. It exists to keep Express request/response plumbing out of the service layer.

## Key elements

- **`getEntityTranslations`** (exported) — The sole controller function. Extracts `entityType` and `id` from route params, validates the ID via `requireId`, calls `localeService.getEntityTranslations(entityType, id)`, then returns `successResponse` with `result.data` or short-circuits on a refused result. Errors are funnelled through `catchAs(response, 'getEntityTranslations')`.

## Relationships

- **`@infrastructure/http/controller`** — Provides `catchAs` (uniform error handling) and `refused` (early-exit for service-level rejection).
- **`@infrastructure/http/ids`** — Provides `requireId`, which validates the `id` param and emits a localized 404 when absent.
- **`@infrastructure/http/response`** — Provides `successResponse` for the happy-path reply.
- **`@infrastructure/i18n`** — Provides `t`, used to build the localized "entity not found" message passed to `requireId`.
- **`../services`** — Source of `localeService.getEntityTranslations`, the actual business-logic call.
- **`src/modules/locales/routes.ts`** — Registers this handler on the admin `GET /locales/translations/:entityType/:id` route.

## Notes

- The `if (!id) return Promise.resolve()` early-return bypasses the promise chain entirely; `requireId` has already sent the HTTP error response, so the controller simply stops. This means the `.catch(catchAs…)` handler will *not* fire for ID-validation failures.
- The route is scoped to admin (per the JSDoc annotation); no explicit middleware guard is visible in this file — that lives in `routes.ts`.
- `entityType` is a free-form string param with no enum/allow-list validation in this controller; any constraint would be enforced downstream in the service.
