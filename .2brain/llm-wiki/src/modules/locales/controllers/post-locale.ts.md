---
source: src/modules/locales/controllers/post-locale.ts
sha256: 457f17fb50dcc6871eca72fdab242e89a0b89ab1121078e60e3a7d2900a031b3
generated_at: 2026-11-14T20:18:24.388888+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/post-locale.ts

## Purpose

Controller for `POST /locales` (admin). Registers a new language in the dynamic tier, making it immediately servable for content negotiation, product text, and search. API-level messages fall back to the default language until a dictionary file is deployed for the new locale.

## Key elements

- **`createLocale(request, response)`** — The sole export. Parses and validates the request body, calls `localeService.createLanguage`, then `localeService.describeStoredLanguage` to fetch the stored record, and responds **201 Created** with the `Language` resource and a `Location` header pointing to `/locales/<tag>`.
- **Body validation** — Extends `CreateLocaleBody` (from `@api/schemas.zod`) inline, adding `wellFormedLocale` on `tag` and `localeService.localeDisplayName` on `name`/`nativeName`. Validation failures short-circuit via `parseBody`.
- **Error handling** — Delegated to `catchAs(response, 'createLocale')` in the final `.catch`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies the shared helpers `parseBody`, `refused`, and `catchAs` used throughout this handler.
- **`src/infrastructure/http/preconditions.ts`** — Provides `answerAsResource`, which sets the `ETag`/resource headers before the 201 response.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, extracting the caller's identity/context for authorization passthrough to the service.
- **`src/infrastructure/http/response.ts`** — Provides `createdResponse`, which writes the 201 status, body, and `Location` header.
- **`src/infrastructure/http/schemas.ts`** — Provides `wellFormedLocale`, a validation helper applied to the `tag` field.
- **`src/modules/locales/services/index.ts`** — Source of `localeService`; this controller calls `createLanguage`, `describeStoredLanguage`, `standingOn`, and reads `localeDisplayName`.
- **`src/modules/locales/routes.ts`** — Wires `createLocale` to the `POST /locales` route.
- **`src/types/index.ts`** — Defines the `CreateLocaleRequest` and `Language` types used in signatures and responses.
- **`src/modules/locales/tests/unit/service.test.ts`** — Unit-tests the `localeService` methods this controller depends on.

## Notes

- The body schema is **extended at the controller level** rather than defined in the shared `@api/schemas.zod` package; the locale-specific display-name validators come from the service, not a static schema.
- The `location` variable (lowercase, local to the handler) deliberately uses the stored tag from `describeStoredLanguage` (not the raw input) so the first subsequent `PUT` can use it directly without a re-read (RFC 9110 §8.8.3).
- Sibling controllers: edits live in `./update-locale.ts`, removals in `./delete-locale.ts`.
