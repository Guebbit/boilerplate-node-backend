---
source: src/modules/locales/controllers/update-locale-entries.ts
sha256: afbcf977b8238ed534e46bf98b082b0de9404ad9401d6c6b97114db8a6502c94
generated_at: 2026-11-14T20:19:10.385675+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/update-locale-entries.ts

## Purpose

Implements the two bulk-entry endpoints for a locale's app dictionary: **PUT** (replace everything not sent) and **PATCH** (merge patch; `null` deletes, omitted keys are kept). The operations are split into two separate routes rather than one route with a boolean flag so a mis-set flag cannot silently empty a dictionary.

## Key elements

- **`importEntries(mode, schema)`** (internal builder) — Returns an Express handler. Parses the body with the given Zod schema, normalizes the locale tag via `localeService.normalizeTag`, enforces `If-Match` concurrency, delegates to `localeService.importEntries`, calls `setEtag` (keyed by `EDIT_REVISION`) on success, and routes errors through `catchAs` with a mode-specific label.
- **`replaceLocaleEntries`** (export) — PUT handler; built as `importEntries('replace', ReplaceLocaleEntriesBody)`.
- **`updateLocaleEntries`** (export) — PATCH handler; built as `importEntries('merge', UpdateLocaleEntriesBody)`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `parseBody`, `refused`, and `catchAs`, the three helpers that form the request-validation / response / error pipeline inside the handler.
- **`src/infrastructure/http/preconditions.ts`** — Provides `withIfMatch` (optimistic-concurrency guard around the service call) and `setEtag` (stamps the new revision on the response).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract the authenticated caller's context and pass it to the service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` to format the 200/201 JSON payload.
- **`src/infrastructure/persistence/revision-plugin.ts`** — Exports the `EDIT_REVISION` constant used as the ETag key so the tag encodes the dictionary's revision counter.
- **`src/modules/locales/services/index.ts`** — Source of `localeService` (`normalizeTag`, `importEntries`); the single domain call this controller delegates to.
- **`src/modules/locales/routes.ts`** — Wires the two exported handlers to their `PUT` / `PATCH` route definitions.
- **`src/types/index.ts`** — Declares `LocaleImportResult`, `UpdateLocaleEntriesRequest`, `ReplaceLocaleEntriesRequest` used for handler typing.

## Notes

- The two exported handlers differ only in the `mode` string and the Zod schema; all logic is shared through `importEntries`. When modifying behaviour, edit the builder, not the exports.
- `catchAs` is given a different error label per mode (`'replaceLocaleEntries'` vs `'updateLocaleEntries'`) so logs can distinguish which bulk operation failed.
- The ETag is set on **both** PUT and PATCH responses using the `EDIT_REVISION` key; the comment references RFC 9110 §9.3.4 regarding how the revision counter appears in the tag.
- Body parsing is delegated to `parseBody` (from the controller infra); if the schema rejects the body, the handler returns early with no further work.
