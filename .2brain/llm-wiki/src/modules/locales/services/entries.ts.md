---
source: src/modules/locales/services/entries.ts
source_sha256: 20b8aa85aeb109141719a2474aeeea753285628c2acfee87cd6c00c988cf844e
context_sha256: 1d0de5523e151f72f219eea89324cd827655fcd3af86d1593a4f5b2c559a6b01
generated_at: 2026-11-22T05:47:21.819076+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/entries.ts

## Purpose
Service layer for locale entries: the translated key/value rows of one language, scoped to one app. It handles paged reads, single-entry CRUD and bulk import. Every write is narrowed to a single app, because a key is unique only within one app's keyspace and collisions only matter inside the tree they share. It returns `ResponseSuccess`/`ResponseReject` objects rather than throwing.

## Key elements
- `searchEntries(tag, filters)`: paged list of a language's entries, sorted by `key` then `app`. It can filter by `app` and `text`. It returns a language-not-found or unknown-app rejection when applicable. The page carries the language's `revision` as its version (via `carryVersion` and `EDIT_REVISION`), so the ETag is the whole dictionary's.
- `createEntry(tag, app, payload, context?)`: trims the key and checks it against that app's existing keys. An exact duplicate returns 409 (`LOCALE_ENTRY_KEY_EXISTS`). `rejectUnusableKey` can also reject it. It then creates the row, audits `ADMIN_LOCALE_ENTRY_CREATED`, refreshes the overlay and returns 201.
- `getEntry(tag, app, entryId)`: reads one entry. It returns 404 if the entry is missing or belongs to another language or app.
- `updateEntry(tag, app, entryId, payload, context?)`: saves a new value and audits `ADMIN_LOCALE_ENTRY_UPDATED`. It uses `auditChanges` with `named: ['value']`, so the text never enters the audit trail. Then it calls `refreshOverlay`.
- `removeEntry(tag, app, entryId, context?)`: deletes the entry, audits `ADMIN_LOCALE_ENTRY_DELETED`, refreshes the overlay and returns `{ key }`.
- `importEntries(tag, app, entries, mode, context?)`: bulk import with `mode` of `'replace'` or `'merge'`. `replace` deletes keys the body did not name. A `null` value means delete the key. The batch is validated up front and nothing is written until it passes.
- Internal helpers:
  - `entryNotFound`: the shared 404 response.
  - `findEntryInLanguage`: looks an entry up by id, then checks it against `tag` and `app`.
  - `rejectBadBatch`: returns 422 (`LOCALE_ENTRY_KEY_INVALID`) for a key outside 1–200 characters, and 409 for keys that are duplicates once trimmed.

## Relationships
- **`../repository`**: `localeRepository` and `localeEntryRepository` do the loading and persistence. The entry repository handles search, `listKeys`, `createEntry`, `saveEntryValue`, `removeEntry` and `findById`. `EntryChange` is the batch input type.
- **`./keys`**: key validation and collision helpers: `findBatchCollision`, `findDuplicateKey`, `isKeyLengthValid` and `rejectUnusableKey`.
- **`./languages`**: `languageNotFound` and `rejectUnknownApp`, shared guards for the language and app.
- **`./overlay`**: `refreshOverlay()` is called after every successful write.
- **`../model`**: `normalizeTag` and the `LocaleEntryDocument` type.
- **`../audit`**, **`observability/audit`** and **`audit-changes`**: `localeAuditActions` supplies the action names, `recordAudit` emits them and `auditChanges` summarizes field changes without values.
- **`persistence/versioning`** and **`revision-plugin`**: `carryVersion` and `EDIT_REVISION` attach the language revision to list results.
- **`persistence/search`**: provides the `PaginatedMeta` type.
- **`http/response`**: `generateSuccess` and `generateReject` build the response objects.
- **`i18n`**: `t()` produces the localized error messages.
- **`src/modules/locales/services/index.ts`**: a sibling file in the same services folder; its exact use of this file is not visible here.

## Notes
- `context` is optional on the write functions. Without it, no audit event is emitted. This is intended for tests that call them as plain helpers.
- Key collision checks are per app. The same key may exist in different apps.
- Entry lookups check both language and app, so a mismatched URL path gives 404 instead of silently editing another row.
- Audit metadata records the key, not the text, so the trail does not become a second copy of the dictionary.
- `refreshOverlay()` is called after each successful create, update and delete.
