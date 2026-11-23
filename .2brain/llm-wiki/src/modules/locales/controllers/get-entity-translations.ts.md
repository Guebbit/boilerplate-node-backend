---
source: src/modules/locales/controllers/get-entity-translations.ts
source_sha256: 2b6109cfa5c98d63858a01616711441a15fdb46bd32e268c76bf3a293984580c
context_sha256: 9221dc652475b0e4284bf4bac589c9b823629cb0a80017e419da775af9779283
generated_at: 2026-11-22T05:42:06.529110+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/get-entity-translations.ts

## Purpose
Express controller for `GET /locales/translations/:entityType/:id` (admin). It is a thin HTTP adapter over `localeService.getEntityTranslations`, returning every locale the given entity has a translation row for in a single response.

## Key elements
- `getEntityTranslations(request, response)` — the exported handler. It:
  1. Reads `entityType` and `id` from `request.params`.
  2. Validates the id with `requireId`, which yields a not-found error built by `entityNotFoundError(entityType, entityId)` if the id is invalid. If no valid id comes back, it resolves immediately (the response has already been handled).
  3. Calls `localeService.getEntityTranslations(entityType, id)`.
  4. If `refused(response, result)` is true, it stops there. Otherwise it calls `setEtag(response, result.data)` and sends `successResponse(response, result.data)`.
  5. Any rejection is handled by `catchAs(response, 'getEntityTranslations')`.

## Relationships
- `src/infrastructure/http/controller.ts` — supplies `catchAs` (error handler) and `refused` (checks whether the service result was a refusal and responds accordingly).
- `src/infrastructure/http/ids.ts` — supplies `requireId`, which validates the route id.
- `src/infrastructure/http/preconditions.ts` — supplies `setEtag`, which sets the ETag header from the result data.
- `src/infrastructure/http/response.ts` — supplies `successResponse`, which sends the success payload.
- `src/modules/locales/services/index.ts` — exports `localeService`, whose `getEntityTranslations` does the actual work.
- `src/modules/locales/services/translations.ts` — exports `entityNotFoundError`, used to build the not-found error for a bad id.
- `src/modules/locales/routes.ts` — the route that wires this handler to its path.

## Notes
- The ETag is the owner entity's tag. It is set so that a later translation save can send `If-Match`.
- The handler returns a Promise in every path (`Promise.resolve()` on invalid id), so it can be awaited or chained uniformly.
