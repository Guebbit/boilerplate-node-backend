---
source: src/modules/locales/services/entries.ts
sha256: cb8bb1f98415b8cfebc69c7bc9cb8c023b6256fd144f8e1929890dd59e92cdc4
generated_at: 2026-09-27T15:01:00.369341+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/entries.ts

## Purpose

Service layer for individual locale entries (one language's translated keys). Provides the read (paginated search), create, update, delete, and bulk-import operations that the locale editing surface calls, all scoped to a language tag and a tenant keyspace.

## Key elements

- **`searchEntries(tag, filters)`** — Returns one page of entries for a language, sorted by `key` (the unique-within-locale ordering). Passes `tenant` to the repository as a filter; unknown tenants yield an empty page rather than a 422.
- **`createEntry(tag, payload, context?)`** — Adds one key for one tenant. Validates tenant, trims the key, checks for an exact duplicate and a structural collision (e.g. `products.list` vs `products.list.title`) scoped to that tenant, then writes. Emits `ADMIN_LOCALE_ENTRY_CREATED` audit and calls `refreshOverlay`.
- **`updateEntry(tag, entryId, payload, context?)`** — Changes the translated value of an existing entry. Resolves the entry via `findEntryInLanguage` (id + locale check) before saving. Emits `ADMIN_LOCALE_ENTRY_UPDATED`; metadata records the key, not the new text.
- **`deleteEntry(tag, entryId, context?)`** — Removes one entry. Other languages retain their copies. Emits `ADMIN_LOCALE_ENTRY_DELETED`.
- **`importEntries(tag, tenant, entries, mode, context?)`** — Bulk write in two modes: `'replace'` (delete un-named keys) or `'merge'` (leave them). Validates the whole batch (duplicates, collisions, unusable keys) before any I/O. Collision checks in `replace` mode ignore keys the batch is about to overwrite. Emits `ADMIN_LOCALE_ENTRY_IMPORTED` with mode, tenant, counts, and revision.
- **`findEntryInLanguage(entryId, tag)`** (internal) — Looks up by id, then verifies `entry.locale === normalizeTag(tag)`. Returns `null` on mismatch, producing a 404 rather than a cross-language edit.
- **`entryNotFound()`** (internal) — Single canonical 404 response for the "entry not in this language" case.

## Relationships

- **`src/infrastructure/http/response.ts`** — All return values are built with `generateSuccess` / `generateReject`; typed as `ResponseSuccess` | `ResponseReject`.
- **`src/infrastructure/i18n/index.ts`** — `t()` supplies user-facing error strings (e.g. `locales.error-entry-not-found`, `locales.error-key-exists`).
- **`src/infrastructure/persistence/search.ts`** — `PaginatedMeta` types the metadata returned alongside paged results.
- **`src/types/index.ts`** — Imports request/response payload types (`CreateLocaleEntryRequest`, `UpdateLocaleEntryRequest`, `LocaleEntryInput`, etc.) and `CallerContext`.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is called after every successful mutation; the optional `context` gates whether an emit occurs.
- **`src/modules/locales/audit.ts`** — Provides the `localeAuditActions` enum values used in audit records.
- **`src/modules/locales/model.ts`** — `normalizeTag` (tag normalisation) and the `LocaleEntryDocument` shape.
- **`src/modules/locales/repository.ts`** — `localeRepository` (language lookup by tag) and `localeEntryRepository` (all entry CRUD, key listing, and bulk import).
- **`src/modules/locales/services/keys.ts`** — `findDuplicateKey`, `findBatchCollision`, `rejectUnusableKey` supply key-level validation.
- **`src/modules/locales/services/languages.ts`** — `languageNotFound` (404 for unknown tag) and `rejectUnknownTenant` (422 for unconfigured tenant on write paths).
- **`src/modules/locales/services/overlay.ts`** — `refreshOverlay` is called after every successful write to invalidate the in-memory overlay cache.

## Notes

- **Tenant scoping is the core invariant.** A key is unique only within `(locale, tenant)`. All duplicate/collision checks pass the target tenant's key list, never the global set. This is why `generic.error-internal` can exist in two tenants simultaneously.
- **Optional `context` parameter.** Every mutating export accepts `context?: CallerContext`. When omitted (unit tests calling the function directly) `recordAudit` is a no-op — no audit row is written.
- **Audit metadata stores the key, never the translated value.** Prevents the audit log from becoming a second, unmanaged copy of the dictionary.
- **`importEntries` is all-or-nothing.** The entire batch is validated (duplicates, collisions, structural checks) before the repository write begins. A half-applied import is treated as worse than a rejected one.
- **Read path does not reject unknown tenants.** `searchEntries` passes the tenant string straight to the repository filter; an unconfigured tenant simply yields zero rows. The 422 rejection (`rejectUnknownTenant`) is reserved for write paths, so a guessed tenant on a read does not leak which tenants exist.
