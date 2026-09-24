---
source: src/modules/locales/services/entries.ts
sha256: d29f38d8d10505e817a218bf51683f7a8229e871f9984fc62654112f7ac57351
generated_at: 2026-09-23T18:51:32.207647+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/entries.ts

## Purpose

CRUD and bulk-import operations for locale entries (translated key-value rows) within a single language and tenant. Every function resolves the language by tag first, then performs the operation through the repository layer, emitting an audit record on success. It exists to centralize the validation rules (duplicate-key, key-collision, tenant-allowlist, cross-language ownership) that apply uniformly across all entry mutations.

## Key elements

- **`searchEntries`** — Paginated, key-sorted listing of a language's entries. Accepts optional `text` and `tenant` filters. Does *not* reject unknown tenants (avoids leaking tenant names to readers).
- **`createEntry`** — Adds one key to a language+tenant. Validates: language exists → tenant is known → key not already present → key doesn't collide with an existing key in the same tree. Emits `ADMIN_LOCALE_ENTRY_CREATED`.
- **`updateEntry`** — Changes one entry's text value. Looks up by entry id, then verifies the entry's `locale` matches the path tag (cross-language access → 404). Emits `ADMIN_LOCALE_ENTRY_UPDATED`.
- **`deleteEntry`** — Removes one entry from a language. Same cross-language ownership check as update. Emits `ADMIN_LOCALE_ENTRY_DELETED`.
- **`importEntries`** — Bulk write in `replace` or `merge` mode. Validates the entire batch (duplicates, collisions, unusable keys vs. survivors) before any write lands. `replace` deletes unnamed stored keys; `merge` leaves them. Emits `ADMIN_LOCALE_ENTRY_IMPORTED` with mode, tenant, counts, and revision.

## Relationships

- **`../repository`** (`localeEntryRepository`, `localeRepository`) — All persistence reads/writes (search, listKeys, create, save, remove, import, findById).
- **`../model`** — Source of the `LocaleEntryDocument` type returned by mutations.
- **`../audit`** — Provides the `localeAuditActions` constants used in every `recordAudit` call.
- **`./keys`** — Validation helpers: `findDuplicateKey`, `findBatchCollision`, `rejectUnusableKey`.
- **`./languages`** — `languageNotFound` (404 for unknown tag) and `rejectUnknownTenant` (422 on write path).
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` envelope builders and the `ResponseSuccess` / `ResponseReject` types.
- **`@infrastructure/i18n`** — `t()` for localized error messages.
- **`@infrastructure/observability/audit`** — `recordAudit` for structured audit-log emission.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type in search results.
- **`@types`** — Request/response shapes (`CreateLocaleEntryRequest`, `LocaleEntry`, `LocaleImportResult`, etc.) and `CallerContext`.
- **`./index`** — Re-exports these functions as the public service API of the locales module.

## Notes

- **Tenant check is write-only by design.** `searchEntries` deliberately skips `rejectUnknownTenant` so a typo'd or guessed tenant simply returns an empty page rather than confirming which tenants exist.
- **Audit metadata stores the key, never the value.** Prevents the audit trail from becoming an unmanaged second copy of the dictionary.
- **`context` is optional on every mutation.** Omitting it (as tests do) suppresses the audit emit entirely.
- **Import collision checks are mode-aware.** In `replace` mode, stored keys the batch overwrites are excluded from the collision set ("survivors" = `[]`); in `merge` mode they remain. This prevents a batch from being rejected for colliding with keys it is about to replace.
- **All-or-nothing import.** Validation of every key completes before the repository call; a half-applied import is never possible.
- **Sort key is `(key)`, not `createdAt`.** Guarantees stable pagination since `(locale, key)` is the uniqueness constraint.
