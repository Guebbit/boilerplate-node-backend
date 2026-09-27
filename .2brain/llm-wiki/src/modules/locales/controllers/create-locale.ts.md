---
source: src/modules/locales/controllers/create-locale.ts
sha256: 2f1aad301e1ff7876b4a7f98dad1b91d600aa59ec3535994d12fd57b8acdde61
generated_at: 2026-09-27T14:57:48.620867+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/create-locale.ts

## Purpose

Handles `POST /locales` (admin) to register a new language in the dynamic tier. It validates the request body, delegates to `localeService.createLanguage`, and returns the created document. It is the create half of a three-file split (create / update / delete) for locale management.

## Key elements

- **`createLocale`** (exported handler) — Accepts an Express `Request`/`Response`. Validates `request.body` against `CreateLocaleBody` (from `@api/schemas.zod`) extended with `name` and `nativeName` fields sourced from `localeService.localeDisplayName`. Calls `localeService.createLanguage` with the parsed data and `callerContextOf(request)`. Returns **201** with the document's `.toJSON()` output cast to `Language`. Handles `refused` (service-level rejection) and `.catch(catchAs)` for unexpected errors.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides the `catchAs`, `refused`, and `rejectValidation` helpers used for error/rejection handling.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract the authenticated caller's context from the request.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 201 reply.
- **`src/modules/locales/services/index.ts`** — Exports `localeService`, whose `createLanguage` and `localeDisplayName` methods are the core business logic.
- **`src/modules/locales/routes.ts`** — Registers `createLocale` as the handler for the `POST /locales` route (admin tier).
- **`src/types/index.ts`** — Supplies the `CreateLocaleRequest` and `Language` types used in the handler signature and response.

## Notes

- The module docstring warns that registering a locale here does **not** make the API answer in that language immediately: `listSupportedLocales()` is read once per worker and i18next loads resources at boot, not per-request. A newly created locale is only resolvable after a worker restart (or however the dynamic tier refresh works).
- The response body is `result.data.toJSON() as Language` — the `as` cast is necessary because the Mongoose document's `_id`/date fields don't match the `Language` wire type until `.toJSON()` applies its transform.
- `CreateLocaleBody` is extended at call time (not at schema-definition time) to add `name` and `nativeName`, both backed by `localeService.localeDisplayName`.
