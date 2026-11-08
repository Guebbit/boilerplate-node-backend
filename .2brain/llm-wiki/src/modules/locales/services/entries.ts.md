---
source: src/modules/locales/services/entries.ts
sha256: 6f519baa1fee52901b3c6275fcc884553c99442b24ba80b1eb2ee28a31935c15
generated_at: 2026-11-08T06:25:16.110260+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/entries.ts

## Purpose

Service layer for locale entries — the individual translated keys within a language, always scoped to a single app. Provides the read (list, get), write (create, update, delete), and bulk-import operations that the translation editor routes call. Every mutation is validated against the `(locale, app)` boundary before touching the repository.

## Key elements

- **`searchEntries(tag, filters?)`** — Paginated list of a language's entries, optionally narrowed to one app. Sorts by `key` then `app` for alphabetical reading. Returns `ResponseSuccess` or a 404/422 reject.
- **`createEntry(tag, app, payload, context?)`** — Adds one key to one app's dictionary. Checks duplicate key and collision (e.g. `products.list` vs `products.list.title`) within the same app only. Emits `ADMIN_LOCALE_ENTRY_CREATED` audit; calls `refreshOverlay()`.
- **`getEntry(tag, app, entryId)`** — Fetches one entry by ID and verifies it belongs to the given language + app; otherwise 404.
- **`updateEntry(tag, app, entryId, payload, context?)`** — Changes an entry's translated text. Uses `auditChanges` to record what moved. Emits `ADMIN_LOCALE_ENTRY_UPDATED`; calls `refreshOverlay()`.
- **`removeEntry(tag, app, entryId, context?)`** — Deletes one key from one language/app. Emits `ADMIN_LOCALE_ENTRY_DELETED`; calls `refreshOverlay()`.
- **`importEntries(tag, app, entries, mode, context?)`** — Bulk import. `replace` deletes keys absent from the body; `merge` leaves them (a `null` value deletes under `merge`). Validates the entire batch (length, duplicates, collisions) before any write.
- **`findEntryInLanguage(entryId, tag, app)`** *(internal)* — Looks up by ID, then checks `locale` and `app` match; returns `null` on mismatch so the caller emits a 404.
- **`rejectBadBatch(inputs, mode)`** *(internal)* — Pre-write validation for imports: empty merge → 422, bad key length → 422, duplicate trimmed keys → 409.
- **`entryNotFound()`** *(internal)* — Shared 404 response using `t('locales.error-entry-not-found')`.

## Relationships

- **`../repository`** — Primary data access: `localeEntryRepository` (CRUD + `search`) and `localeRepository` (language lookup by tag).
- **`./keys`** — Key-validation helpers: `findBatchCollision`, `findDuplicateKey`, `isKeyLengthValid`, `rejectUnusableKey`.
- **`./languages`** — `languageNotFound` (404 for unknown tag) and `rejectUnknownApp` (422 for unconfigured app).
- **`./overlay`** — `refreshOverlay()` called after every successful write to invalidate the runtime translation cache.
- **`../audit`** — `localeAuditActions` constants (`ADMIN_LOCALE_ENTRY_CREATED/UPDATED/DELETED`) used in audit metadata.
- **`@infrastructure/observability/audit`** — `recordAudit` emits structured audit events.
- **`@infrastructure/observability/audit-changes`** — `auditChanges` computes a diff summary for the update audit trail.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/i18n`** — `t()` for user-facing error messages.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type for list responses.
- **`../model`** — `LocaleEntryDocument` type and `normalizeTag` helper.
- **`@types`** — Request/response payload types (`CreateLocaleEntryRequest`, `ReplaceLocaleEntryRequest`, `LocaleImportResult`, `LocaleApp`) and `CallerContext`.

## Notes

- **App-scoped uniqueness.** A key like `generic.error-internal-server-error` may exist once per app. All duplicate/collision checks are narrowed to the target app; cross-app duplicates are legal.
- **Audit stores the key, not the text.** `updateEntry` records *which* key changed and a structural diff, but never the translated string itself, to avoid creating a second unmanaged copy of the dictionary.
- **`context` is optional on all write operations.** Omitting it skips the audit emit entirely — this is the contract tests rely on when calling the service as a plain helper.
- **`refreshOverlay()` fires on every successful mutation** (create, update, delete, import). Forgetting it in a new code path would leave the runtime translation cache stale.
- **Bulk import is all-or-nothing at the validation layer.** `rejectBadBatch` runs before any repository call; a half-applied import is explicitly avoided.
- **`replace` vs `merge` is a single flag**, not two separate functions. `replace` deletes keys absent from the body; `merge` leaves them. A `null` value means "delete" under `merge`; `replace` bodies never carry `null`.
