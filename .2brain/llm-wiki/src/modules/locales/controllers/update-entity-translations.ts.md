---
source: src/modules/locales/controllers/update-entity-translations.ts
source_sha256: faa0f79a097a3dd51c282ea7b081fc0c194f5ebd86ff848a3c9d0d62d9becfcd
context_sha256: a0db2e1f6566e038e9315bc75a94db6e6106a6772fd4ec9cf886a348af553f99
generated_at: 2026-11-22T05:44:01.077401+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/update-entity-translations.ts

## Purpose
Thin Express HTTP adapters for `PUT` and `PATCH /locales/translations/:entityType/:id` (both admin). They validate the request, apply an `If-Match` precondition, call the locale service, and return the entity's updated translations. PUT replaces the whole set (a stored locale the body doesn't name is deleted, and fields a sent locale omits are cleared). PATCH merges per RFC 7396 (an object merges field by field, `null` deletes, an absent key is left alone). It mirrors the replace/merge split used by `update-locale-entries.ts`.

## Key elements
- `writeEntityTranslations(schema, write, operation)` — private handler factory shared by both routes. The handler:
  1. Reads `entityType` and `id` from the path params.
  2. Runs `requireId`, using `entityNotFoundError(entityType, entityId)` as the not-found response.
  3. Runs `parseBody(schema, request.body, response)`.
  4. Calls `write(...)` inside `withIfMatch`, passing `callerContextOf(request)`.
  5. Returns early if `refused(response, result)`. Otherwise it calls `setEtag(response, result.data)` and `successResponse(response, result.data)`.
  6. Failures go through `catchAs(response, operation)`.
- `replaceEntityTranslations` — the PUT handler. It uses the `ReplaceEntityTranslationsBody` schema and `localeService.replaceEntityTranslations`.
- `updateEntityTranslations` — the PATCH handler. It uses the `UpdateEntityTranslationsBody` schema and `localeService.updateEntityTranslations`.

## Relationships
- `src/infrastructure/http/controller.ts` supplies `parseBody`, `refused` and `catchAs`.
- `src/infrastructure/http/ids.ts` supplies `requireId`.
- `src/infrastructure/http/preconditions.ts` supplies `withIfMatch` and `setEtag`. The new ETag is returned so the caller's next save needs no re-read.
- `src/infrastructure/http/request.ts` supplies `callerContextOf`.
- `src/infrastructure/http/response.ts` supplies `successResponse` and the `ResponseSuccess` and `ResponseReject` types.
- `src/modules/locales/services/index.ts` supplies `localeService`.
- `src/modules/locales/services/translations.ts` supplies `entityNotFoundError` and the `EntityTranslationsResult` type.
- `src/types/index.ts` supplies `CallerContext` and the request body types. `src/types/auth-context.ts` is a related neighbor in the same type layer.
- `src/modules/locales/routes.ts` is the neighbor that wires these two handlers to their routes.

## Notes
- `successResponse` is deliberately called without an `<EntityTranslations>` type argument. The rows are already in wire shape at this point (see `get-entity-translations.ts`).
- The handler returns without a value after `requireId` or `parseBody` fails. Those helpers are expected to have already written the error response.
- The body schemas are imported from the generated `@api/schemas.zod`.
- The full PUT and PATCH behavior tables are in `openapi.yaml`.
