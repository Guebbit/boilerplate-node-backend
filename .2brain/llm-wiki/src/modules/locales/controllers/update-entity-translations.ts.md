---
source: src/modules/locales/controllers/update-entity-translations.ts
sha256: faa0f79a097a3dd51c282ea7b081fc0c194f5ebd86ff848a3c9d0d62d9becfcd
generated_at: 2026-11-14T20:18:45.147423+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/update-entity-translations.ts

## Purpose

Thin HTTP adapters for `PUT` and `PATCH /locales/translations/:entityType/:id`. Both handlers delegate to `localeService` but differ in semantics: PUT replaces the full translation set (unlisted locales are deleted), PATCH merges per RFC 7396 (absent keys are left alone). The two handlers share a single factory so request parsing, ETag/If-Match handling, and error mapping are written once.

## Key elements

- **`writeEntityTranslations`** (module-private factory) — Builds an Express handler from a Zod schema, a service-write callback, and an operation name. Handles param extraction (`entityType`, `id`), body validation, `requireId` lookup, `withIfMatch` precondition, ETag setting, and `catchAs` error mapping in one flow.
- **`replaceEntityTranslations`** (export) — The PUT handler. Schema: `ReplaceEntityTranslationsBody`; service call: `localeService.replaceEntityTranslations`; logged as `'replaceEntityTranslations'`.
- **`updateEntityTranslations`** (export) — The PATCH handler. Schema: `UpdateEntityTranslationsBody`; service call: `localeService.updateEntityTranslations`; logged as `'updateEntityTranslations'`.

## Relationships

- **`../services` (`localeService`)** — Both handlers pass the validated body straight to the corresponding service method; this file contains no business logic.
- **`../services/translations`** — Imports `entityNotFoundError` (used in the `requireId` not-found branch) and the `EntityTranslationsResult` type (returned by the service, forwarded to the client).
- **`@infrastructure/http/controller`** — `catchAs`, `parseBody`, `refused` provide the uniform error/validation/409 plumbing.
- **`@infrastructure/http/preconditions`** — `withIfMatch` enforces optimistic concurrency; `setEtag` writes the new revision tag so the caller's next save doesn't require a re-read.
- **`@infrastructure/http/ids`** — `requireId` resolves the `:id` param against the DB and short-circuits with a 404 if absent.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the authenticated `CallerContext` passed to the service call.
- **`@infrastructure/http/response`** — `successResponse` and the `ResponseSuccess`/`ResponseReject` union types shape the final reply.
- **`@types`** — `CallerContext`, `ReplaceEntityTranslationsRequest`, `UpdateEntityTranslationsRequest` are the typed request envelopes used in the Express `Request` generic.
- **`src/modules/locales/routes.ts`** — Wires these two exports onto the `PUT`/`PATCH` routes under `/locales/translations/:entityType/:id`.

## Notes

- PUT vs. PATCH is purely a body-schema + service-method swap; the HTTP-layer code (validation, ETag, error mapping) is identical. If a third "merge with delete" mode is ever needed, extend the factory rather than adding another handler.
- The response body is **not** re-serialized through a `<EntityTranslations>` OpenAPI component — the service already returns wire-shaped rows. See `get-entity-translations.ts` docblock for the rationale.
- `requireId` runs before body parsing; a missing entity yields a 404 without ever touching the request body.
