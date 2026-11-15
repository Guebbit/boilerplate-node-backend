---
source: src/modules/locales/controllers/get-entity-translations.ts
sha256: 2b6109cfa5c98d63858a01616711441a15fdb46bd32e268c76bf3a293984580c
generated_at: 2026-11-14T20:17:11.579206+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-entity-translations.ts

## Purpose

Thin HTTP adapter that exposes `GET /locales/translations/:entityType/:id`. It validates the route parameters, delegates to `localeService.getEntityTranslations`, and shapes the Express response (ETag, preconditions, success/error). The file exists so that the service layer stays free of Express concerns.

## Key elements

- **`getEntityTranslations(request, response)`** — The sole export. An Express handler (admin route) that:
  1. Reads `entityType` and `id` from `request.params`.
  2. Validates `id` via `requireId`; on failure, responds with a custom `entityNotFoundError` and returns early.
  3. Calls `localeService.getEntityTranslations(entityType, id)`.
  4. Checks the preconditions result (`refused`) and aborts if the client's condition was not met.
  5. Sets an ETag from the returned data (`setEtag`), then sends the payload via `successResponse`.
  6. Catches any thrown error and forwards it to `catchAs`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/response.ts` | Imports `successResponse` to serialise the data payload. |
| `src/infrastructure/http/controller.ts` | Imports `catchAs` (error formatting) and `refused` (precondition check). |
| `src/infrastructure/http/ids.ts` | Imports `requireId` to parse/validate the `:id` param. |
| `src/infrastructure/http/preconditions.ts` | Imports `setEtag` to stamp the ETag header. |
| `src/modules/locales/services/index.ts` | Imports `localeService`; the actual data access lives in its `getEntityTranslations` method. |
| `src/modules/locales/services/translations.ts` | Imports `entityNotFoundError`, used as the custom 404 body when the id is not a valid UUID. |
| `src/modules/locales/routes.ts` | Registers this handler on the `GET /locales/translations/:entityType/:id` route. |

## Notes

- The ETag is derived from the full result data (`result.data`), not just a hash of the entity id. The inline comment makes the intent explicit: a subsequent `PUT`/`PATCH` to save a translation is expected to echo this ETag back as `If-Match`.
- The early-return `Promise.resolve()` when `requireId` rejects means the function is technically `void | Promise<void>`; callers in the routes file should not `.then`-chain on it.
- `entityType` is passed through as a free-form string to the service; no enum validation happens at the controller level.
