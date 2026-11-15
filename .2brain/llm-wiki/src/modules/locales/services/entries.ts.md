---
source: src/modules/locales/services/entries.ts
sha256: 4d685bd53d1010b39c8111b0b490bfabcfa0c2d33277c3f499d8b0fa67e658b1
generated_at: 2026-11-14T20:21:22.210375+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/entries.ts

## Purpose

Service layer for reading and writing individual locale entries (translated key-value pairs) within a single language and app. Translates route-level requests into repository calls, enforces per-app key uniqueness, emits audit records, and triggers overlay refresh after every mutation.

## Key elements

- **`searchEntries`** — Paginated, optionally app-scoped list of a language's entries, sorted alphabetically by `key`. Returns a 422 for an unconfigured app. The response carries the language's `revision` as its version (ETag).
- **`createEntry`** — Adds one key to one language/app. Validates key length, uniqueness, and structural usability before writing. Emits `ADMIN_LOCALE_ENTRY_CREATED`.
- **`getEntry`** — Reads a single entry by id, verifying it belongs to the requested language *and* app (404 otherwise).
- **`updateEntry`** — Replaces one entry's value. Captures before/after diff via `auditChanges` but stores only the key name in audit metadata (never the translated text). Emits `ADMIN_LOCALE_ENTRY_UPDATED`.
- **`removeEntry`** — Deletes one key from one language/app; other languages keep theirs. Emits `ADMIN_LOCALE_ENTRY_DELETED`.
- **`importEntries`** — Bulk import in `replace` or `merge` mode. Validates the entire batch (length, duplicates, collisions) before any write. `null` values delete their key under `merge`; `replace` deletes all unmentioned keys.
- **`findEntryInLanguage`** *(internal)* — Fetches by id then checks `locale` and `app` match; returns `null` on mismatch.
- **`rejectBadBatch`** *(internal)* — Pre-flight validation for bulk imports (invalid length → 422, duplicate → 409).
- **`entryNotFound`** *(internal)* — Shared 404 response builder.

## Relationships

- **`../repository`** — All reads and writes go through `localeEntryRepository` and `localeRepository`; this file never touches persistence directly.
- **`./keys`** — Delegates all key-validation logic (`isKeyLengthValid`, `findDuplicateKey`, `findBatchCollision`, `rejectUnusableKey`).
- **`./languages`** — Reuses `languageNotFound` and `rejectUnknownApp` for consistent 404/422 responses.
- **`./overlay`** — Calls `refreshOverlay()` after every successful write (create, update, remove, import) so the runtime translation cache picks up changes.
- **`../audit`** — Imports `localeAuditActions` as the canonical action-string constants for every audit emit.
- **`@infrastructure/observability/audit` / `audit-changes`** — `recordAudit` logs each mutation; `auditChanges` computes the before/after diff for update.
- **`@infrastructure/persistence/versioning` / `revision-plugin`** — `carryVersion` stamps the language revision onto the paginated response; `EDIT_REVISION` names the field.
- **`@infrastructure/http/response`** — All return values are shaped through `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** — `t()` localizes every error message.
- **`@infrastructure/persistence/search`** — Supplies the `PaginatedMeta` type on list responses.

## Notes

- **App-scoped uniqueness:** A key like `generic.error-internal-server-error` may legitimately exist in two apps. All duplicate/collision checks are narrowed to the target app; cross-app collisions are expected, not errors.
- **Audit stores keys, not values:** The audit trail records *which* key changed and *who* changed it, never the translated text itself—avoiding a second, unmanaged copy of the dictionary.
- **Optional `context` parameter:** `createEntry`, `updateEntry`, `removeEntry`, and `importEntries` accept `context?: CallerContext`. When omitted (as in unit tests), no audit record is emitted.
- **Atomic bulk import:** `importEntries` validates the full batch before any repository write; a half-applied import is intentionally impossible.
- **`replace` vs `merge` is one flag, not two endpoints:** The only behavioral difference is whether unmentioned keys are deleted.
- **Sort order is `key` then `app`:** Deliberate alphabetical order for translators, overriding the repository's default `createdAt` sort. The unique index is `(locale, app, key)`.
- **`findEntryInLanguage` double-checks `locale` and `app` after the id lookup:** Prevents a caller from cross-editing an entry that belongs to a different app or language by guessing its id (returns 404, not 403).
