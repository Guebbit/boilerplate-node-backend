---
source: src/modules/locales/controllers/create-locale.ts
sha256: 5a6b43109717b1d31ae591fd215b11559e1968c185e6ee8626ef66bc6a964598
generated_at: 2026-10-29T04:19:29.253005+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/create-locale.ts

## Purpose

Admin controller for `POST /locales`. Registers a new language in the dynamic tier; once created, the language is immediately available for content negotiation, product text, and search. API error messages fall back to the default language until a dictionary file is deployed for the new locale.

## Key elements

- **`createLocale`** (exported) — Express handler for `POST /locales`. Validates the request body, delegates to `localeService.createLanguage`, then re-fetches the stored record via `localeService.describeStoredLanguage` to build a `Language` response body. Returns `201` with a `Location` header of `/locales/<tag>`.

## Relationships

- **`src/modules/locales/routes.ts`** — Registers `createLocale` as the handler for the `POST /locales` admin route.
- **`src/modules/locales/services/index.ts`** — Supplies `localeService`, from which this file calls `createLanguage`, `describeStoredLanguage`, `localeDisplayName`, and `standingOn`.
- **`src/infrastructure/http/controller.ts`** — Provides the `parseBody`, `refused`, and `catchAs` helpers used for validation, rejection, and error handling.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts the caller's identity/context from the Express request.
- **`src/infrastructure/http/response.ts`** — Provides `createdResponse`, the 201 response helper that sets the body and `Location` header.
- **`src/types/index.ts`** — Source of the `CreateLocaleRequest` and `Language` types used in the handler signature and response.
- **`src/modules/locales/tests/unit/service.test.ts`** — Unit-tests the service layer (`localeService`) that this controller delegates to.

## Notes

- The Zod schema is **extended at call time**: `CreateLocaleBody.extend({ name: localeService.localeDisplayName, nativeName: localeService.localeDisplayName })`. The `name` and `nativeName` fields are computed dynamically via the service, not static string fields.
- The controller performs **two sequential service calls** (create → describe) rather than returning the create result directly, so the response shape comes from the stored record, not the input.
- Sibling controllers: `./update-locale.ts` (edit) and `./delete-locale.ts` (removal), per the module doc comment.
