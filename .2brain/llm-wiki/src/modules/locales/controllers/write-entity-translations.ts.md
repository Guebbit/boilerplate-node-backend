---
source: src/modules/locales/controllers/write-entity-translations.ts
sha256: fcf2f6bd06c93251c311415a8eb34c9390806f0f65a2c102d0f5a407a37e7c30
generated_at: 2026-10-29T04:20:41.125628+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/write-entity-translations.ts

## Purpose

Thin HTTP adapters for `PUT` and `PATCH /locales/translations/:entityType/:id`. Each handler validates the path param and body, then delegates to `localeService.replaceEntityTranslations` or `localeService.updateEntityTranslations`. The file exists to keep the two endpoints' shared request-parsing, auth-context extraction, and error-shaping logic in one place via a generic builder.

## Key elements

- **`writeEntityTranslations`** (internal) — Generic builder. Accepts a Zod schema, a service-call function, and an operation name; returns an Express handler that: extracts `entityType`/`id` from params, enforces a numeric id via `requireId`, parses the body against the schema, invokes the service call with `callerContextOf(request)`, and routes the result through `successResponse` or `refused`. Errors are funnelled to `catchAs(response, operation)`.
- **`replaceEntityTranslations`** (exported) — `PUT` handler. Full-replace semantics: any stored locale not named in the body is deleted; any field a sent locale omits is cleared.
- **`updateEntityTranslations`** (exported) — `PATCH` handler. Merge semantics (RFC 7396): objects merge field-by-field, `null` deletes a field, absent keys are left untouched.

## Relationships

- **`@infrastructure/http/controller`** — supplies `parseBody`, `refused`, and `catchAs`, which form the request-validation → response-dispatch → error-capture pipeline used by the builder.
- **`@infrastructure/http/ids`** — `requireId` validates the `:id` path param and short-circuits with a 404 (i18n-ised message) when the id is malformed.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the authenticated caller context from the Express request to pass into the service layer.
- **`@infrastructure/http/response`** — `successResponse` writes the 200 body; `ResponseSuccess`/`ResponseReject` types shape the service-return union.
- **`@infrastructure/i18n`** — `t` localises the entity-not-found error message.
- **`../services` / `../services/translations`** — `localeService.replaceEntityTranslations` and `localeService.updateEntityTranslations` are the actual business-logic calls; `EntityTranslationsResult` is the return type both handlers resolve.
- **`@types`** — `CallerContext`, `ReplaceEntityTranslationsRequest`, `UpdateEntityTranslationsRequest` type the auth context and the two request shapes.
- **`src/modules/locales/routes.ts`** — registers these two exported handlers on their respective method/path combinations.

## Notes

- PUT and PATCH differ *only* in schema and service call; the builder guarantees they share identical id-validation, body-parsing, auth extraction, and error handling.
- The PATCH `successResponse` intentionally does **not** wrap the payload in an extra `<EntityTranslations>` envelope — the rows are already in wire shape by the time they reach the controller (see `get-entity-translations.ts` docblock for the full rationale).
- The replace/merge split mirrors the one in `write-locale-entries.ts` for bulk imports; keep both in sync if the semantic contract changes.
