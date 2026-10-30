---
source: src/modules/locales/repository.ts
sha256: becf7aef9e3a5722eee82c951c586cad7e268479643f57a3f4dfe1960174179d
generated_at: 2026-10-29T04:22:14.938796+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/repository.ts

## Purpose

Repository layer over the `languages` and `localeentries` MongoDB collections. It centralises every read and write the locales module performs against the database and enforces one caller-invisible invariant: every mutation to an entry also atomically bumps the language's `revision` counter, so no service call can alter a dictionary without signalling clients to re-fetch.

## Key elements

- **`localeBase` / `entryBase`** — Base CRUD/search repositories built via `createRepository`; `localeBase` supports exact tag + boolean active filters, `entryBase` supports combined text search over `key` + `value` and an exact `app` filter.
- **`findByTag`** — Normalised single-language lookup; the entry point for most module routes.
- **`listInactiveTags` / `listActiveTags`** — `distinct('tag')` queries that feed the public manifest's served/inactive partition.
- **`list`** — Unpaginated, tag-sorted language listing (intentionally unbounded; a deployment has few languages).
- **`countEntriesByLocale`** — Single `$group` aggregate over frontend-app entries only; populates the manifest's `entryCount`.
- **`listEntries(locale, app)`** — All entries for one `(locale, app)` pair, key-sorted for byte-stable builds.
- **`listEntriesByApp(app)`** — All entries for one app across languages, sorted `(locale, key)`; backs the override overlay.
- **`listKeys(locale, app)`** — Key-only projection; used by the collision check on every write to avoid loading values.
- **`bumpRevision(tag)`** — Atomic `$inc` on `revision`; returns the new value.
- **`valuesByKey` / `currentRevision`** — Read helpers for import diffing and no-op responses.
- **`createEntry` / `saveEntryValue` / `removeEntry`** — Single-entry writes, each paired with a revision bump. `saveEntryValue` short-circuits (returns current revision, no write) when the value is unchanged.
- **`importEntries`** — Bulk upsert + delete in a single transaction (`withTransaction`). Computes a diff against existing rows so unchanged keys are neither written nor counted. `replace: true` also removes keys absent from the payload. Returns `ImportCounts` and the new revision.
- **Interfaces** — `EntryInput` (key + value), `EntryChange` (key + nullable value), `ImportCounts` (created/updated/removed).

## Relationships

- **`src/modules/locales/model.ts`** — Source of `localeModel`, `localeEntryModel`, document types, transform functions, and `normalizeTag`; all Mongoose models and serialisation live there.
- **`src/infrastructure/persistence/create-repository.ts`** — Provides the `createRepository` factory and `Repository` type used to build `localeBase` and `entryBase`.
- **`src/infrastructure/persistence/changes.ts`** — Imported (`setAndUnset`) for field-level change tracking in writes.
- **`src/infrastructure/runtime/database.ts`** — Provides `withTransaction` (session management) used by `importEntries`.
- **`src/infrastructure/i18n/index.ts`** — Supplies `getFallbackLocale` for fallback resolution in the (truncated) remainder.
- **`src/modules/locales/apps.ts`** — Provides `frontendAppIds()` used to scope entry counts and queries to client-facing apps only.
- **`src/modules/locales/module.ts`** — Wires this repository into the module's service layer and HTTP routes.
- **`src/modules/locales/services/entries.ts`, `messages.ts`, `translations.ts`, `languages.ts`, `keys.ts`, `capabilities.ts`** — Service consumers that call the repository functions above.
- **`scenarios/locales.ts`** — Integration/test scenarios exercising these queries end-to-end.

## Notes

- **Revision bump is deliberately non-transactional.** The two writes (row, then counter) are ordered so a crash between them causes at most one under-fetch by a client—never a stale dictionary served as current. This is the opposite of `importEntries`, which *is* transactional (D17e-2) because a partial upsert-or-delete would leave stale keys surviving a caller's exact-set contract.
- **`list` is unpaginated on purpose.** `findAll`'s default limit of 10 would silently truncate a growing manifest.
- **`bulkWrite` in `importEntries` bypasses Mongoose's global `maxTimeMS`.** Its size is bounded by the caller's request body; cutting a transaction's write short is considered worse than waiting.
- **Text search on entries covers both `key` and `value` in one filter** rather than exposing separate `key=` / `value=` parameters, so a translator and a developer use the same search box.
- **`saveEntryValue` is a no-op when the value is unchanged**, returning the current revision without touching the document—preventing spurious `updatedAt` stamps and unnecessary client re-downloads.
