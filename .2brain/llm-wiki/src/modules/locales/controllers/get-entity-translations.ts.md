---
source: src/modules/locales/controllers/get-entity-translations.ts
sha256: 2fb1976b37c5ea45b2a81a672e76c8b9a9ecc9cd7d668561c51fab5eb4974470
generated_at: 2026-09-27T14:58:17.216060+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-entity-translations.ts

## Purpose

Thin Express controller for the admin route `GET /locales/translations/:entityType/:id`. It reads the two URL params, delegates to `localeService.getEntityTranslations`, and serialises the result (or an error) into an HTTP response. It exists solely to bridge the HTTP layer to the service layer.

## Key elements

- **`getEntityTranslations`** (exported) – Express handler typed with `Request<{ entityType: string; id: string }>`. Calls `localeService.getEntityTranslations(entityType, id)`, then either returns a `refused` response (access denied) or a `successResponse` with `result.data`. Errors are funnelled through `catchAs(response, 'getEntityTranslations')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – provides `refused` (short-circuit on access-denied results) and `catchAs` (uniform error-to-HTTP mapping with the operation name tag).
- **`src/infrastructure/http/response.ts`** – provides `successResponse` for the happy-path JSON envelope.
- **`src/modules/locales/routes.ts`** – registers `getEntityTranslations` on the Express router for the translations path.
- **`src/modules/locales/services/index.ts`** – source of the `localeService` instance whose `getEntityTranslations` method does the actual data work.

## Notes

- Auth is implied to be handled upstream (JSDoc marks the route as *admin*); this handler performs no auth logic itself.
- Route params are typed inline in the `Request` generic rather than imported from a shared param type, which is the pattern in this module.
- Error handling relies entirely on the `refused`/`catchAs` helpers; no `try/catch` or manual status codes appear here.
