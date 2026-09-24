---
source: src/modules/locales/controllers/upsert-entity-translations.ts
sha256: e1ad9366254a84351ea136188c7fed69fc79f1153daa4b97ea116e4e372871f1
generated_at: 2026-09-23T18:49:06.739568+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/upsert-entity-translations.ts

## Purpose

Thin HTTP adapter for the `PATCH /locales/translations/:entityType/:id` (admin) endpoint. Parses and validates the request body, delegates to `localeService.upsertEntityTranslations`, and shapes the HTTP response. Contains no business logic.

## Key elements

- **`upsertEntityTranslations`** (exported) — Controller function. Validates the body against the `UpsertEntityTranslationsBody` Zod schema, calls `localeService.upsertEntityTranslations(entityType, id, body, callerContext)`, then either returns `successResponse`, short-circuits via `refused`, or maps the rejection with `catchAs`.
- **Merge semantics** (documented in docblock) — An object value upserts a locale, `null` deletes it, an absent key leaves it unchanged. Full three-way table lives in `openapi.yaml`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, `parseBody`, and `refused` for body validation and response short-circuiting.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to extract the authenticated caller's context from the Express request.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to serialize the service result.
- **`src/modules/locales/services/index.ts`** — Imports `localeService` and calls its `upsertEntityTranslations` method (the actual domain logic).
- **`src/modules/locales/routes.ts`** — Presumed wiring point that binds this handler to the `PATCH /locales/translations/:entityType/:id` route.
- **`src/types/index.ts`** — Imports the `UpsertTranslationsRequest` type used in the `Request` generics.

## Notes

- The success response intentionally omits an `<EntityTranslations>` wrapper type — the service already returns rows in wire shape (see `get-entity-translations.ts` docblock for rationale).
- The controller is admin-only; authorization is not enforced here (presumably handled upstream by the route or middleware).
- Body validation uses the Zod schema `UpsertEntityTranslationsBody` (from `@api/schemas.zod`), not the raw `UpsertTranslationsRequest` type, which is only used for Express generic typing.
