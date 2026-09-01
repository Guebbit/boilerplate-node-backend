# src/modules/locales/controllers/write-locales.ts

## Purpose

Admin-only controllers for the two mutating locale endpoints: `POST /locales` (register a new language in the dynamic tier) and `PUT /locales/:locale` (edit a language's display names, direction, or visibility). They validate the request body with Zod, delegate the actual work to `localeService`, and shape the HTTP response.

## Key elements

- **`displayName`** (Zod schema) — `z.string().trim().min(1)`. Trims before the length check so a single-space string is rejected here (with a named field error) rather than surfacing later as a generic Mongoose 422.
- **`createLocale`** (exported) — Validates the body against `CreateLocaleBody` extended with the `displayName` rule for `name` and `nativeName`. Calls `localeService.createLanguage`, returns **201** on success.
- **`updateLocale`** (exported) — Validates the body against `UpdateLocaleBody` extended with optional `displayName` rules. Calls `localeService.updateLanguage` with `request.params.locale`, returns **200** on success.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, `refused`, and `rejectValidation`, the shared error-handling helpers both handlers use.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts the authenticated caller context from the Express `Request` and passes it into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for uniform 200/201 response envelopes.
- **`src/modules/locales/services/index.ts`** — Exports `localeService`; the sole data-access dependency of both handlers (`createLanguage` / `updateLanguage`).
- **`src/modules/locales/routes.ts`** — The route definitions that bind `createLocale` and `updateLocale` to the Express `POST /locales` and `PUT /locales/:locale` paths.
- **`src/types/index.ts`** — Source of the `CreateLocaleRequest` and `UpdateLocaleRequest` generic types used in the Express `Request<…>` signatures.

## Notes

- The locale **tag** (language code) is deliberately not part of the `PUT` body. Every entry in the dictionary references it, so renaming would cascade. Only display names, direction, and visibility are mutable.
- Neither handler touches i18next's per-worker locale table; that is read once at boot via `listSupportedLocales()`. A newly created locale is not resolvable until a worker restart.
- The `displayName` trim-before-min-length pattern is a workaround for a mismatch between OpenAPI `minLength: 1` (which accepts `" "`) and Mongoose's automatic trim on a `required: true` field (which turns `" "` into `""`).
