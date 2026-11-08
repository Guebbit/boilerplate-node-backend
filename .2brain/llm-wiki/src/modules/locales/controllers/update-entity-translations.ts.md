---
source: src/modules/locales/controllers/update-entity-translations.ts
sha256: 1f48bf4019d99c59fa75f65548d3ee76b8a844e7b4854130e9548926906d88a9
generated_at: 2026-11-08T06:22:21.243293+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/update-entity-translations.ts

## Purpose

Thin HTTP adapters that expose `PUT` and `PATCH /locales/translations/:entityType/:id` as admin endpoints. Each handler validates the path id and body, then delegates to the corresponding `localeService` method (`replaceEntityTranslations` or `updateEntityTranslations`). The file exists to keep the replace/merge semantic split at the HTTP layer while sharing a single handler-builder closure.

## Key elements

- **`writeEntityTranslations`** (internal) — Generic factory that, given a Zod schema, a service `write` function, and an operation name, returns an Express handler. The handler extracts `entityType`/`id` from params, validates the id via `requireId`, parses the body against the schema, calls the service, and routes the result through `refused`/`successResponse` with `catchAs` for errors.
- **`replaceEntityTranslations`** (exported) — `PUT` handler. Binds `ReplaceEntityTranslationsBody` schema and `localeService.replaceEntityTranslations`. Semantics: full replacement; a stored locale not named in the body is deleted.
- **`updateEntityTranslations`** (exported) — `PATCH` handler. Binds `UpdateEntityTranslationsBody` schema and `localeService.updateEntityTranslations`. Semantics: RFC 7396 merge; absent keys are left untouched, `null` deletes a field.

## Relationships

- **`src/modules/locales/services/index.ts`** — provides `localeService`, the domain service whose two methods are invoked here.
- **`src/modules/locales/services/translations.ts`** — source of the `EntityTranslationsResult` return type used in the service call signature.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (error→HTTP mapping), `parseBody` (Zod validation), and `refused` (reject-result short-circuit).
- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `:id` path param and writes a 404 with an i18n message on failure.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts the authenticated `CallerContext` from the request.
- **`src/infrastructure/http/response.ts`** — `successResponse`, `ResponseSuccess`, `ResponseReject` shape the outgoing payload.
- **`src/infrastructure/i18n/context.ts`** / **`index.ts`** — `t()` resolves the `locales.error-entity-not-found` message for the 404 path.
- **`src/types/auth-context.ts`** — defines `CallerContext` passed into the service call.
- **`src/types/index.ts`** — re-exports `UpdateEntityTranslationsRequest` / `ReplaceEntityTranslationsRequest` used in the handler's generic `Request` type.
- **`src/modules/locales/routes.ts`** — registers the two exported handlers on their respective routes.

## Notes

- Both handlers are **admin-only** (per docblock); no auth guard lives in this file — enforcement is expected upstream (routes or middleware).
- The `writeEntityTranslations` factory is the only shared code path; there is no separate PUT vs PATCH logic here beyond schema and service-call binding.
- For the PATCH export, the docblock explicitly notes that `successResponse` is called **without** an `<EntityTranslations>` generic because the rows arrive already in wire shape (see `get-entity-translations.ts` docblock for the rationale).
- Error logging is keyed by the `operation` string (`'replaceEntityTranslations'` / `'updateEntityTranslations'`) passed to `catchAs`, keeping traces attributable.
