---
source: src/modules/locales/services/entries.ts
sha256: a4d3d6f08af224ac434b200836b13201e24f4c3743efe4dc40486f15899224d7
generated_at: 2026-10-15T10:45:26.270321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/entries.ts

## Purpose
Service-layer CRUD and bulk-import operations for locale translation entries (key/value pairs within a single language). Every read and write is scoped to a `(language-tag, app)` pair, enforcing that a key is unique only within one keyspace. All mutations trigger an audit record and an overlay cache refresh.

## Key elements
- **`searchEntries`** — Paginated, alphabetically-sorted listing of a language's entries, optionally narrowed to one app. Returns a unified success/reject envelope.
- **`createEntry`** — Adds a single key to a language/app. Validates uniqueness and structural collisions against existing keys in the *same* app, then persists. Emits `ADMIN_LOCALE_ENTRY_CREATED`.
- **`updateEntry`** — Changes the text of one entry after verifying it belongs to the requested language and app. Emits `ADMIN_LOCALE_ENTRY_UPDATED`.
- **`deleteEntry`** — Removes one entry (scoped to language + app). Emits `ADMIN_LOCALE_ENTRY_DELETED`.
- **`importEntries`** — Bulk import in `replace` or `merge` mode. Validates the entire batch (duplicates, collisions, unusable keys) before any write. Emits `ADMIN_LOCALE_ENTRY_IMPORTED` with mode, app, counts, and revision.
- **`findEntryInLanguage`** *(private)* — Loads an entry by id, then confirms its `locale` and `app` match the caller's parameters; returns `null` on mismatch to produce a 404.
- **`entryNotFound`** *(private)* — Shared 404 reject response using the i18n key `locales.error-entry-not-found`.

## Relationships
- **`../repository.ts`** — Primary data access: `localeEntryRepository` (CRUD, `listKeys`, `importEntries`, `search`) and `localeRepository` (language lookup by tag).
- **`./keys.ts`** — Key-validation helpers: `findDuplicateKey`, `findBatchCollision`, `rejectUnusableKey`.
- **`./languages.ts`** — `rejectUnknownApp` (422 for unconfigured apps) and `languageNotFound` (404 for missing language).
- **`./overlay.ts`** — `refreshOverlay()` called after every successful write so the in-memory translation cache picks up changes.
- **`../audit.ts`** — Provides `localeAuditActions` enum values used in audit records.
- **`@infrastructure/observability/audit`** — `recordAudit` emits the structured audit event (no-op when `context` is undefined).
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` envelope constructors and `ResponseSuccess` / `ResponseReject` types.
- **`@infrastructure/i18n`** — `t()` for translating error message keys into the caller's language.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type for the search response shape.
- **`@types`** — Request/response type definitions (`CreateLocaleEntryRequest`, `LocaleEntry`, `LocaleApp`, `CallerContext`, etc.).
- **`./index.ts`** — Barrel re-export; consumers import entries functions through the services index rather than this file directly.

## Notes
- **App-scoped uniqueness.** The same key string may legitimately exist in two different apps (e.g. `generic.error-internal`). All collision and duplicate checks are narrowed to the app being written; checking globally would reject valid pairs.
- **Post-fetch scoping check.** `findEntryInLanguage` retrieves by id first, then verifies `locale` and `app` in code. This prevents a PUT with a foreign entry-id from silently editing another app's or language's row.
- **`context` is optional on writes.** Omitting `CallerContext` (as tests do) suppresses the audit emit entirely; the function still performs the write.
- **Import atomicity.** `importEntries` validates the full batch (duplicates, collisions, per-key usability) *before* calling `localeEntryRepository.importEntries`. In `replace` mode, collision checks ignore keys the batch itself overwrites, since those will be deleted.
- **Audit stores the key, not the value.** The audit metadata records *which* key changed and *who* changed it, never the translated text itself, to avoid duplicating the dictionary in the audit log.
