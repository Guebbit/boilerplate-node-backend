---
source: src/modules/locales/services/entries.ts
sha256: 6f519baa1fee52901b3c6275fcc884553c99442b24ba80b1eb2ee28a31935c15
generated_at: 2026-10-29T04:23:24.507508+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/entries.ts

## Purpose

CRUD service layer for locale entries (translated keys) scoped to a single language and app. Provides paginated reads, single-key create/update/delete, and bulk import (replace or merge). Every operation validates the app against the language's configured apps before touching the repository, and every write emits an audit record and refreshes the overlay cache.

## Key elements

- **`searchEntries(tag, filters?)`** — Returns one page of a language's entries, optionally narrowed to one app. Sorts by `key` then `app` for alphabetical reading. Returns 404 if the language is missing, 422 if the app is unconfigured.
- **`createEntry(tag, app, payload, context?)`** — Adds one key. Checks for exact-key duplicates and tree-collisions (e.g. `products.list` vs `products.list.title`) scoped to the same app. Returns 201 on success.
- **`getEntry(tag, app, entryId)`** — Single-entry read. 404s if the entry doesn't exist, belongs to another language, or belongs to a different app.
- **`updateEntry(tag, app, entryId, payload, context?)`** — Replaces an entry's text. Records a change diff via `auditChanges` but stores only the key name (never the text) in audit metadata.
- **`removeEntry(tag, app, entryId, context?)`** — Deletes one entry. Returns the removed key name. Other languages are unaffected.
- **`importEntries(tag, app, entries, mode, context?)`** — Bulk import. `replace` deletes keys not in the body; `merge` leaves them and treats `null` values as deletions. Validates the entire batch (length, duplicates, collisions) before any write.
- **`findEntryInLanguage(entryId, tag, app)`** (internal) — Looks up by id, then verifies `locale` and `app` match; returns `null` on mismatch so callers 404.
- **`rejectBadBatch(inputs, mode)`** (internal) — Pre-flight validation for bulk imports: rejects empty merge, out-of-range keys, and in-batch duplicates.
- **`entryNotFound()`** (internal) — Shared 404 response for missing/mismatched entries.

## Relationships

- **`@infrastructure/http/response`** — All return values are wrapped in `generateSuccess` / `generateReject`; the function signatures are typed as `ResponseSuccess<T> | ResponseReject`.
- **`@infrastructure/i18n`** — `t()` provides localized error messages for every rejection.
- **`@infrastructure/observability/audit`** — `recordAudit` emits structured audit events (create, update, delete) when a `CallerContext` is supplied.
- **`@infrastructure/observability/audit-changes`** — `auditChanges` diffs the old and new `value` field so the audit trail captures what changed without storing the text.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` types the pagination metadata returned by `searchEntries`.
- **`src/modules/locales/audit.ts`** — `localeAuditActions` enum supplies the action strings for audit records.
- **`src/modules/locales/model.ts`** — `normalizeTag` ensures tag comparison is consistent; `LocaleEntryDocument` is the document shape used throughout.
- **`src/modules/locales/repository.ts`** — `localeEntryRepository` and `localeRepository` perform all database reads/writes; `EntryChange` types the bulk-import input.
- **`src/modules/locales/services/keys.ts`** — `isKeyLengthValid`, `findDuplicateKey`, `findBatchCollision`, `rejectUnusableKey` provide key-shape and collision checks.
- **`src/modules/locales/services/languages.ts`** — `languageNotFound` (404) and `rejectUnknownApp` (422) are the standard app/language guard helpers.
- **`src/modules/locales/services/overlay.ts`** — `refreshOverlay` is called after every successful write to invalidate the in-memory translation cache.
- **`@types`** — Request/response types (`CreateLocaleEntryRequest`, `ReplaceLocaleEntryRequest`, `LocaleEntry`, `LocaleImportResult`, `LocaleApp`) and `CallerContext`.

## Notes

- **Key uniqueness is per-app.** The composite unique index is `(locale, app, key)`, so the same key string is valid in two different apps. All collision and duplicate checks are scoped to the target app.
- **Audit never stores translated text.** Only the key name, locale tag, and app are recorded; the change diff (`auditChanges`) tracks that `value` changed without persisting the copy.
- **`context` is optional.** Tests and non-HTTP callers omit it, which suppresses the audit emit. Production routes always pass it.
- **Bulk import is all-or-nothing.** Validation (`rejectBadBatch`, `findBatchCollision`) completes before any repository write; a partial import is impossible.
- **`replace` vs `merge` differ only in deletion semantics.** `replace` removes keys absent from the body; `merge` keeps them and interprets `null` values as explicit deletions.
- **`refreshOverlay()` runs after every write** (create, update, delete, import) to keep the runtime translation cache in sync.
