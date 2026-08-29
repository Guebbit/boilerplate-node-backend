# src/modules/locales/services/entries.ts

## Purpose

Service layer for the CRUD and bulk-import operations on individual translated key-value rows (entries) within a language. It sits between the HTTP controller and the repositories, enforcing tenant-scoped key uniqueness, validating key structure, and emitting audit events. All writes are narrowed to a single tenant because a key is only unique within one keyspace.

## Key elements

- **`searchEntries(tag, filters)`** — Returns one paginated page of a language's entries, sorted by `key` (stable total order), with optional text and tenant filters. Tenant is passed through `readableTenant` (lenient: drops unknown ids rather than rejecting).
- **`createEntry(tag, payload, context?)`** — Adds a single key. Validates tenant is known, key is not already present in that tenant, and the key is structurally safe relative to existing keys in the same tenant. Emits `ADMIN_LOCALE_ENTRY_CREATED` audit when a `CallerContext` is supplied.
- **`updateEntry(tag, entryId, payload, context?)`** — Changes one entry's value. Looks up by id, then verifies `entry.locale` matches the path tag (cross-language edit → 404). Emits `ADMIN_LOCALE_ENTRY_UPDATED`.
- **`deleteEntry(tag, entryId, context?)`** — Removes one entry after the same locale-match check. Returns the deleted key. Emits `ADMIN_LOCALE_ENTRY_DELETED`.
- **`importEntries(tag, tenant, entries, mode, context?)`** — Bulk import. `mode` is `'replace'` (delete unlisted keys) or `'merge'` (leave them). Entire batch is validated (duplicates, unsafe segments, collisions with surviving stored keys) before anything is written. Emits `ADMIN_LOCALE_ENTRY_IMPORTED` with `mode`, `tenant`, counts, and revision in metadata.

## Relationships

- **`./keys`** — Delegates all key-structure validation: `findDuplicateKey`, `findUnsafeKeySegment`, `findBatchCollision`, `rejectUnusableKey`.
- **`./languages`** — Uses `languageNotFound` (standard 404 shape), `rejectUnknownTenant` (strict write-time guard), and `readableTenant` (lenient read-time passthrough).
- **`../repository`** — Calls `localeRepository.findByTag` and `localeMessageRepository` (search, listKeys, createEntry, findById, saveEntryValue, removeEntry, importEntries).
- **`../audit`** — Imports `localeAuditActions` enum for the `action` field in every audit event.
- **`../model`** — Uses `LocaleMessageDocument` as the domain type for entries.
- **`@infrastructure/http/response`** — Wraps all returns in `generateSuccess` / `generateReject`.
- **`@infrastructure/http/request`** — Accepts `CallerContext` for audit emission.
- **`@infrastructure/observability/audit`** — `buildAuditEvent` + `emitAuditEvent` on every write.
- **`@infrastructure/i18n`** — `t()` for user-facing error strings.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type on the search result.
- **`@types`** — Request/response payload types (`CreateLocaleEntryRequest`, `UpdateLocaleEntryRequest`, `LocaleEntryInput`, `LocaleImportResult`, `LocaleTenant`).

## Notes

- **Tenant scoping is the central invariant.** Collision and usability checks are always narrowed to the tenant being written. The same key may legitimately exist in two tenants.
- **`replace` vs `merge` is the sole behavioral difference** in `importEntries`. In replace mode the "survivors" list is empty, so batch keys are never checked against keys they are about to overwrite.
- **Audit is conditional.** If `context` is `undefined` (e.g., internal test calls), no audit event fires. Production controllers always pass it.
- **Audit metadata stores the key, never the value.** This keeps the audit trail from becoming an unmanaged second copy of the dictionary.
- **Sort key is `key`, not `createdAt`.** This guarantees a stable, deterministic page boundary for translators browsing alphabetically.
- **`readableTenant` (read) vs `rejectUnknownTenant` (write)** are intentional halves of one policy: reads are forgiving, writes are strict. They live in `./languages` and are used side-by-side here.
