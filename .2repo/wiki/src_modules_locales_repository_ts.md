# src/modules/locales/repository.ts

## Purpose

Data-access layer for the locales module. Wraps two Mongoose collections—languages and translated entries—behind two exported repository objects, and enforces one invariant that callers must not be trusted to maintain: every write to `localemessages` atomically bumps the parent language's `revision` counter so clients know when to re-download.

## Key elements

- **`EntryInput` / `ImportCounts`** — small interfaces for a single key-value write and for bulk-import result counts (`created`, `updated`, `removed`).
- **`localeBase` / `entryBase`** — base CRUD + search repositories built via `createRepository`. The entries base defines a single `text` filter spanning both `key` and `value` columns, plus an `exact` filter on `tenant`.
- **`localeRepository`** (exported) — composes `localeBase` with `findByTag`, `publicScope` (returns `{ active: true }`), `list` (unpaginated, sorted by tag), `bumpRevision` (atomic `$inc`), and `deleteLocaleCascade` (deletes entries *then* the language row).
- **`localeMessageRepository`** (exported) — composes `entryBase` with `countEntriesByLocale` (aggregate over frontend tenants only), `listEntries` (one locale + tenant, key-sorted), `listEntriesByTenant` (all locales for one tenant), `listKeys` (key-only projection), and the four write paths: `createEntry`, `saveEntryValue`, `removeEntry`, `importEntries` (bulk upsert + optional `replace` delete, single revision bump).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory and the `Repository<T>` interface that both base repositories extend.
- **`src/modules/locales/model.ts`** — source of the Mongoose models (`localeModel`, `localeMessageModel`), document types, and the transform functions passed to `createRepository`.
- **`src/modules/locales/tenants.ts`** — supplies `frontendTenantIds()`, used by `countEntriesByLocale` to exclude backend-tenant rows from the manifest count.
- **`src/types/index.ts`** — defines the `LocaleTenant` type used throughout the signatures.
- **`src/modules/locales/services/*.ts`** (`languages`, `entries`, `keys`, `messages`, `capabilities`) — the service layer that calls into the two repositories; they never touch Mongoose models directly.
- **`src/modules/locales/demo.ts`** — seed/demo script that exercises the write paths.
- **`src/modules/locales/tests/integration/repository.test.ts`** — integration tests for the functions exported here.

## Notes

- **Revision is not a transaction.** Writes are ordered rows-then-counter; a crash between the two means a client under-fetches once, never caches a stale dictionary as current.
- **`list` is unpaginated on purpose.** Languages number in the single digits by construction; `findAll`'s default limit of 10 would silently truncate.
- **`listKeys` projects only `{ key: 1, _id: 0 }`** because the collision check runs on every write and values are the heavy payload.
- **`importEntries` does one `bulkWrite` + one `bumpRevision`** for the whole batch, not N bumps.
- **`deleteLocaleCascade` deletes entries before the language row** so a mid-operation crash leaves the language briefly empty (the intended end-state) rather than stale rows that a recreated language would inherit.
- **Export types are written out explicitly.** Mongoose `Query` generics are large enough that TypeScript raises TS7056 when an inferred type crosses an export boundary; the annotations also serve as the readable contract for each collection's API.
