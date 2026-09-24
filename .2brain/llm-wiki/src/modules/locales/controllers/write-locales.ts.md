---
source: src/modules/locales/controllers/write-locales.ts
sha256: 761c46c973218df548271d3553a81780d7cb5c6e45dc91af848699f3c1bb9944
generated_at: 2026-09-23T18:49:28.020482+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/write-locales.ts

## Purpose

Admin-only controller handlers for the two write endpoints on the locales resource: **POST /locales** (register a language in the dynamic tier) and **PUT /locales/:locale** (edit a language's display names, direction, or visibility). Each handler validates the request body with Zod, delegates to `localeService`, and shapes the HTTP response. The file exists to keep validation, authorization-context extraction, and wire-format concerns out of the service layer.

## Key elements

- **`displayName`** – Zod schema (`z.string().trim().min(1)`) applied to `name` and `nativeName` fields. Catches the "single space" case that would otherwise slip past `minLength: 1` and fail later as a generic Mongoose 422.
- **`createLocale(request, response)`** – POST /locales handler. Parses body with `CreateLocaleBody` extended by the `displayName` rule, calls `localeService.createLanguage`, returns **201** with the stored document.
- **`updateLocale(request, response)`** – PUT /locales/:locale handler. Parses body with `UpdateLocaleBody` (name/nativeName optional), calls `localeService.updateLanguage`, returns **200** with the updated document. The locale tag (route param) is **not** editable.

## Relationships

- **`@infrastructure/http/controller`** – Supplies the `catchAs`, `refused`, and `rejectValidation` helpers used for uniform error/refusal handling and validation-failure short-circuits.
- **`@infrastructure/http/request`** – `callerContextOf(request)` extracts the authenticated caller's context passed into service calls.
- **`@infrastructure/http/response`** – `successResponse` wraps the domain payload into the standard JSON envelope.
- **`src/modules/locales/services/index.ts`** – Exposes `localeService`; this controller is a thin adapter in front of `createLanguage` / `updateLanguage`.
- **`src/types/index.ts`** – Provides the `Language`, `CreateLocaleRequest`, and `UpdateLocaleRequest` type contracts used in signatures and response generics.
- **`src/modules/locales/routes.ts`** – Graph neighbor that binds these two exports to Express routes (the file does not import routes directly).

## Notes

- **Why the local `displayName` schema?** The OpenAPI spec's `minLength: 1` accepts `" "` (one space). Mongoose trims it to `""` on a `required: true` column, producing an opaque 422. Trimming *before* the length check here yields a field-named validation error instead.
- **`.toJSON()` before responding.** The Mongoose document is typed as stored (`_id`, Date objects). Calling `.toJSON()` applies the model's transform (`_id → id`, dates → ISO strings) so the wire shape matches the `Language` type. The `as Language` cast bridges that gap.
- **Boot-time locale registration.** `listSupportedLocales()` is read once per worker; i18next registers its resources at boot, not per request. Creating or editing a locale here does **not** immediately change which languages the API can negotiate until the worker restarts.
