---
source: src/modules/locales/controllers/write-entity-translations.ts
sha256: af71d05c4df2f7ad39b2a65414a12467aa0617d7675a3c7e4deba566b91eb8b5
generated_at: 2026-09-27T14:58:48.050715+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/write-entity-translations.ts

## Purpose

Thin HTTP adapter exposing `PUT` and `PATCH /locales/translations/:entityType/:id`. It validates the request body against a Zod schema, delegates to the appropriate `localeService` method (full replace vs. merge/upsert), and formats the success or refusal response. The file exists to keep route wiring in `routes.ts` to a single-line import and to centralize the shared validation/dispatch logic for both verbs.

## Key elements

- **`writeEntityTranslations`** (internal) — Shared handler parameterised by `mode: 'replace' | 'upsert'`. Selects the Zod schema (`ReplaceEntityTranslationsBody` or `UpsertTranslationsBody`), parses the body, calls `localeService.replaceEntityTranslations` or `.upsertEntityTranslations` with the caller context, and returns the result via `successResponse` or `refused`.
- **`replaceEntityTranslations`** (exported) — PUT handler. Calls `writeEntityTranslations` with mode `'replace'`. A stored locale not named in the body is deleted.
- **`upsertEntityTranslations`** (exported) — PATCH handler. Calls `writeEntityTranslations` with mode `'upsert'`. An object upserts a locale, `null` deletes it, an absent key is left alone.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs`, which handle body validation, refusal short-circuits, and error formatting.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts authentication/actor context from the request to pass into the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, which serialises the service result onto the Express `Response`.
- **`src/modules/locales/routes.ts`** — Registers `replaceEntityTranslations` and `upsertEntityTranslations` on the `PUT` and `PATCH` routes respectively.
- **`src/modules/locales/services/index.ts`** — Provides `localeService`, the domain logic layer that actually performs the replace or upsert against storage.
- **`src/types/index.ts`** — Contributes the `UpsertTranslationsRequest` type used in the Express `Request` generic for both handlers.

## Notes

- The replace/merge semantic split mirrors the pattern in `write-locale-entries.ts` (bulk import pair), so the two controller files are intentionally parallel.
- `successResponse` is called *without* an `<EntityTranslations>` generic — the rows arrive already in wire shape by the time they reach this layer (see `get-entity-translations.ts` docblock for the rationale).
- Both routes are admin-scoped; the controller itself does no auth check (handled by middleware upstream of `routes.ts`).
