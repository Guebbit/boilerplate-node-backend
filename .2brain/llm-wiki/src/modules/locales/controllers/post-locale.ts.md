---
source: src/modules/locales/controllers/post-locale.ts
sha256: 5a6b43109717b1d31ae591fd215b11559e1968c185e6ee8626ef66bc6a964598
generated_at: 2026-11-08T06:21:59.157271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/post-locale.ts

## Purpose

Admin controller for `POST /locales` that registers a new language in the dynamic tier. Once created, the language is immediately negotiable in subsequent requests; product text and search follow, and API messages fall back to the default language until a dictionary is deployed. It is the "create" half of the locale CRUD set (edit: `update-locale.ts`, delete: `delete-locale.ts`).

## Key elements

- **`createLocale`** (exported) — The sole handler. Validates the request body against `CreateLocaleBody` (zod) extended with `localeService.localeDisplayName` for both `name` and `nativeName`, calls `localeService.createLanguage` with the caller context, then enriches the result via `localeService.describeStoredLanguage` before returning a `201 Created` with a `Location` header pointing to `/locales/{tag}`.
- **Body validation** — Uses `parseBody` (infrastructure helper) to run the zod schema; short-circuits with an error response if validation fails.
- **Refusal handling** — `refused(response, result)` checks for domain-level rejections (e.g. duplicate language) and maps them to an appropriate HTTP error.
- **Error boundary** — `.catch(catchAs(response, 'createLocale'))` funnels unhandled rejections into a consistent error shape.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs`, the three infrastructure helpers that shape validation, domain-rejection, and error handling.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts the authenticated caller's context for audit/authorization on the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `createdResponse`, which writes the `201` status, body, and `Location` header.
- **`src/modules/locales/services/index.ts`** — Exposes `localeService`, the domain service that actually persists the language and enriches it for the response.
- **`src/modules/locales/routes.ts`** — Registers `createLocale` as the handler for the `POST /locales` admin route.
- **`src/types/index.ts`** — Source of the `CreateLocaleRequest` and `Language` types used in the handler's generics.
- **`src/modules/locales/tests/unit/service.test.ts`** — Exercises `localeService.createLanguage` (the core logic this controller delegates to), but does not test the controller itself.

## Notes

- The controller is thin: all domain logic lives in `localeService`. The only controller-level logic is schema extension (adding `name`/`nativeName` derived from `localeService.localeDisplayName`) and the post-create `describeStoredLanguage` enrichment step.
- `request.caller` is passed directly to `describeStoredLanguage` as a "standing" argument (distinct from `callerContextOf(request)` used for the create call) — two different shapes of caller information are consumed by two different service methods.
- The `Language` type imported from `@types` is the *stored/described* language shape returned to the client, not the raw create-input shape.
