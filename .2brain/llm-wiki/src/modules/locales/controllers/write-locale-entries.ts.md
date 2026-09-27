---
source: src/modules/locales/controllers/write-locale-entries.ts
sha256: 24d068b605ffafd7ad42e8dd058beff49a37a47b3d1b6a885f60e01ca87a9ac6
generated_at: 2026-09-27T14:59:02.586401+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/write-locale-entries.ts

## Purpose

HTTP controller layer for the four mutating locale-entry routes: create one entry, update one entry's value, replace all entries (PUT), and merge/upsert a subset (PATCH). Sits between the Express router and `localeService`, handling body validation, caller-context extraction, and response shaping.

## Key elements

- **`createLocaleEntry`** — `POST /locales/:locale/entries`. Validates body via `CreateLocaleEntryBody`, delegates to `localeService.createEntry`, returns `201` with the new `LocaleEntry`.
- **`updateLocaleEntry`** — `PUT /locales/:locale/entries/:entryId`. Edits the *value* of one entry; the key itself is immutable. Delegates to `localeService.updateEntry`.
- **`importEntries`** (private) — Shared implementation for both bulk routes. Accepts a `mode: 'replace' | 'merge'` argument and calls `localeService.importEntries`.
- **`replaceLocaleEntries`** — `PUT /locales/:locale/entries`. Full replacement: entries not in the payload are deleted. Delegates with `mode = 'replace'`.
- **`mergeLocaleEntries`** — `PATCH /locales/:locale/entries`. Upsert-only: entries not in the payload are left untouched. Delegates with `mode = 'merge'`.

## Relationships

- **`@infrastructure/http/controller`** — Supplies `rejectValidation`, `refused`, and `catchAs` helpers used by every handler for the validation-failure, tenant-refusal, and exception paths.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the tenant/caller identity passed to every service call.
- **`@infrastructure/http/response`** — `successResponse` builds the JSON envelope for 2xx replies.
- **`@types`** — Provides the wire/DTO types (`LocaleEntry`, `LocaleEntryInput`, `LocaleImportResult`, `LocaleTenant`, etc.) used in handler signatures and response generics.
- **`@api/schemas.zod`** — Zod schemas (`CreateLocaleEntryBody`, `UpdateLocaleEntryBody`, `ReplaceLocaleEntriesBody`, `MergeLocaleEntriesBody`) drive runtime body validation before the service is called.
- **`../services`** — `localeService` is the sole domain-service dependency; every handler delegates actual data work to it.
- **`src/modules/locales/routes.ts`** — Registers these four exports as the route callbacks.

## Notes

- The two bulk routes are intentionally split into separate handlers (PUT vs PATCH) rather than one route with a boolean flag, so a mis-set flag cannot silently empty a dictionary.
- `.toJSON()` is called on the Mongoose document before returning it, applying the model's `_id → id` and date-to-ISO-string transform; the returned object is then cast to the `LocaleEntry` wire type.
- The entry key (its `entryId`) is treated as identity and is not editable via `updateLocaleEntry`; changing a key is a delete + create, not an update.
- All handlers follow the same pattern: `safeParse` → early `rejectValidation` → service call → `refused` check → `successResponse` → `catchAs` on the catch branch.
