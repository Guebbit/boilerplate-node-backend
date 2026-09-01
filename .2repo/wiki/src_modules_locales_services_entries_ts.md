# src/modules/locales/services/entries.ts

## Purpose

Service layer for CRUD and bulk-import of locale entries (translated key-value rows) scoped to a single language and tenant. Sits between the HTTP handlers and the repository, enforcing tenant-scoped key uniqueness, key-naming rules, and audit logging on every write.

## Key elements

- **`searchEntries(tag, filters)`** — Paginated list of entries for one language, sorted by `key` (not `createdAt`) to guarantee stable page boundaries. Unknown tenant in filters is silently dropped via `readableTenant`.
- **`createEntry(tag, payload, context?)`** — Validates the tenant, trims the key, checks for exact duplicates and structural collisions (`rejectUnusableKey`) against the same tenant's existing keys, then inserts. Emits `ADMIN_LOCALE_ENTRY_CREATED` audit when `context` is provided.
- **`updateEntry(tag, entryId, payload, context?)`** — Looks up by id, verifies the entry's `locale` matches the path tag (404 on mismatch), saves the new value. Emits `ADMIN_LOCALE_ENTRY_UPDATED`.
- **`deleteEntry(tag, entryId, context?)`** — Same id + locale cross-check as update, then removes the row. Emits `ADMIN_LOCALE_ENTRY_DELETED`.
- **`importEntries(tag, tenant, entries, mode, context?)`** — Bulk import. Validates duplicates and batch collisions in-memory, then validates each key against the *surviving* stored keys (for `replace` that set is empty; for `merge` it is the stored keys the batch doesn't overwrite). Writes atomically via the repository. Emits `ADMIN_LOCALE_ENTRY_IMPORTED` with `mode`, `tenant`, counts, and revision in metadata.

## Relationships

- **`@infrastructure/http/response`** — All return values are wrapped in `generateSuccess` / `generateReject` to produce the unified `ResponseSuccess | ResponseReject` shape.
- **`@infrastructure/http/request`** — Imports `CallerContext` (optional parameter on write operations; its presence gates the audit emit).
- **`@infrastructure/i18n`** — Imports `t` for localized error messages (key-exists, collision, not-found).
- **`@infrastructure/observability/audit`** — `buildAuditEvent` + `emitAuditEvent` fire after each successful write.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type on the search response.
- **`../repository`** — `localeRepository.findByTag` (language lookup) and `localeMessageRepository` (all row reads/writes: `search`, `listKeys`, `createEntry`, `findById`, `saveEntryValue`, `removeEntry`, `importEntries`).
- **`../audit`** — `localeAuditActions` constants naming the four audit action strings.
- **`../model`** — `LocaleMessageDocument` type (the persisted row shape).
- **`./keys`** — `findDuplicateKey`, `findBatchCollision`, `rejectUnusableKey` (key-naming and collision logic).
- **`./languages`** — `languageNotFound` (404 factory), `readableTenant` (lenient filter), `rejectUnknownTenant` (strict guard).
- **`@types`** — Request/response payload types (`CreateLocaleEntryRequest`, `UpdateLocaleEntryRequest`, `LocaleEntryInput`, `LocaleImportResult`, `LocaleTenant`).
- **`services/index.ts`** — Barrel re-export so handlers can import from the service namespace.

## Notes

- **Asymmetric tenant policy:** reads silently drop an unknown tenant (`readableTenant`); writes reject it outright (`rejectUnknownTenant`). This is intentional — a filter narrowing is safer than a 400 on a list endpoint.
- **Key scope is `(locale, tenant)`:** the same key string is legal in two tenants. All duplicate/collision checks are narrowed to the tenant being written.
- **`context?` is the audit toggle:** passing `undefined` (as tests do) suppresses the `emitAuditEvent` call entirely. Production handlers always pass a real `CallerContext`.
- **`importEntries` is all-or-nothing:** the entire batch is validated before any write; a half-applied import is explicitly treated as worse than a rejection.
- **Audit metadata records the key, never the translated value** — the trail is an index into the dictionary, not a second copy of it.
- **Sort order for pagination is `(locale, key)`:** the natural unique constraint doubles as the total ordering, preventing a row from appearing on two pages.
