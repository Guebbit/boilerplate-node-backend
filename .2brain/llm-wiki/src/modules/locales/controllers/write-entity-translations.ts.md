---
source: src/modules/locales/controllers/write-entity-translations.ts
sha256: 43136615378c7908d514ef43515dea33bd03742d6de96c3c2d61b2a3d630263a
generated_at: 2026-10-15T10:42:53.028637+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/write-entity-translations.ts

## Purpose

Thin Express controllers for `PUT` and `PATCH /locales/translations/:entityType/:id`. Each handler validates a Zod body schema, extracts the entity params, delegates to the corresponding `localeService` method, and formats the response. The two routes share a single internal factory so the only differences are the schema, the service call, and the operation name used in error logs.

## Key elements

- **`writeEntityTranslations`** (internal factory) — Builds an Express handler from a Zod schema, a service write function, and an operation name. Handles param extraction (`entityType`, `id`), body parsing, caller-context extraction, and uniform success/rejection/error response plumbing.
- **`replaceEntityTranslations`** (export) — `PUT` handler. Uses `ReplaceEntityTranslationsBody` and calls `localeService.replaceEntityTranslations`. Full-replace semantics: stored locales/fields not present in the body are removed.
- **`upsertEntityTranslations`** (export) — `PATCH` handler. Uses `UpsertTranslationsBody` and calls `localeService.upsertEntityTranslations`. RFC 7396 merge semantics: `null` deletes a field; absent keys are left untouched.

## Relationships

- **`src/modules/locales/routes.ts`** — Imports and mounts `replaceEntityTranslations` / `upsertEntityTranslations` on the `/locales/translations/:entityType/:id` routes.
- **`src/modules/locales/services/index.ts`** — Source of the `localeService` object whose `replaceEntityTranslations` and `upsertEntityTranslations` methods are the actual write operations.
- **`src/modules/locales/services/translations.ts`** — Defines the `EntityTranslationsResult` type used as the success payload.
- **`src/infrastructure/http/controller.ts`** — Provides `parseBody`, `refused`, and `catchAs` used for request validation and error handling.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` for validating the `:id` route param.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract auth/caller metadata for the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and the `ResponseSuccess` / `ResponseReject` types.
- **`src/infrastructure/i18n/index.ts`** — Provides `t` for localising the "entity not found" error message.
- **`src/types/index.ts`** (re-exported from `src/types/auth-context.ts`) — Supplies `CallerContext`, `MergeTranslationsRequest`, and `UpsertTranslationsRequest` types.

## Notes

- Both routes are admin-only (per the docstrings); no additional RBAC check is performed here beyond whatever the router/middleware enforces.
- The `successResponse` call for `upsertEntityTranslations` intentionally does **not** wrap the payload in an extra `<EntityTranslations>` envelope — the service already returns wire-shaped rows. See `get-entity-translations.ts` docblock for the full rationale.
- The PUT/PATCH semantic split mirrors the one used in `write-locale-entries.ts` for its bulk-import pair; if you change one convention, check the other.
