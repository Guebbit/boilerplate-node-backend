---
source: src/modules/locales/controllers/write-locale-entries.ts
sha256: 5653cc1b97a617bf66b159819350ea721824a6bd49ebb544449f62937c60250a
generated_at: 2026-10-29T04:20:56.418669+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/write-locale-entries.ts

## Purpose

Express handlers for the write (create/read/replace) operations on a locale app's dictionary entries. Covers single-entry create/update and two bulk import modes (full replace vs. JSON-merge-patch), all scoped to the `/locales/:locale/apps/:app/entries` resource path.

## Key elements

- **`createLocaleEntry`** (POST) — Creates a single entry. Derives a trimmed-key schema (`createTrimmedEntryBody`) so a blank `key` fails as a field-level 422 before hitting the service. Returns `201` with the entry and a location header.
- **`replaceLocaleEntry`** (PUT `…/entries/:entryId`) — Updates the `value` of one entry. Validates `entryId` via `requireId`; the `key` field is intentionally absent from the body schema (it is the lookup identity, not mutable).
- **`importEntries`** (internal factory) — Builds a bulk handler given a `'replace' | 'merge'` mode and the matching Zod body schema. Both bulk endpoints share this implementation; only the mode string and schema differ.
- **`replaceLocaleEntries`** (PUT) — `importEntries('replace', ReplaceLocaleEntriesBody)`. Any stored key not present in the body is deleted.
- **`updateLocaleEntries`** (PATCH) — `importEntries('merge', UpdateLocaleEntriesBody)`. Absent keys are untouched; a `null` value deletes; a string upserts.

## Relationships

- **`@infrastructure/http/controller`** — Provides `parseBody`, `refused`, and `catchAs`, the three shared helper functions every handler in this file calls for validation, service-result rejection, and error formatting.
- **`@infrastructure/http/response`** — `successResponse` and `createdResponse` shape the JSON envelope for 200 and 201 replies.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the authenticated caller context passed into every service call.
- **`@infrastructure/http/ids`** — `requireId` validates the `entryId` URL segment in `replaceLocaleEntry`, returning a 404 with a localized message on failure.
- **`@infrastructure/http/schemas`** — `trimmedInto` is used to derive `createTrimmedEntryBody` (trims whitespace on the `key` field).
- **`src/modules/locales/services/index.ts`** — `localeService` is the sole domain service consumed here (`createEntry`, `updateEntry`, `importEntries`).
- **`src/modules/locales/presenters.ts`** — `presentLocaleEntry` shapes the service's internal entry record into the public `LocaleEntry` response type.
- **`src/modules/locales/routes.ts`** — Registers these exported handlers on the Express router (not imported here; the dependency is one-directional).
- **`src/types/index.ts`** — Source of the request-body and domain types (`CreateLocaleEntryRequest`, `ReplaceLocaleEntryRequest`, `LocaleImportResult`, etc.) used in the handler signatures.

## Notes

- The key is **not** editable via `replaceLocaleEntry`; changing a key is semantically a delete + create, not an update. The body schema for that route omits `key` entirely.
- The two bulk routes are split into PUT/PATCH methods (rather than a single route with a boolean flag) so a mis-set flag cannot silently empty a dictionary. The `importEntries` factory parameterizes on the mode string and schema to avoid duplicating the handler body.
- `catchAs` receives a different label string for the two bulk modes (`'replaceLocaleEntries'` vs. `'updateLocaleEntries'`) so error logs can distinguish them.
