---
source: src/modules/locales/repository.ts
source_sha256: c940e293589bf6614338a54b2dda62490905f29dabd7e575168f8b40a19359f3
context_sha256: 1b9699be357af5e0a010425c253238ff469ba801cd6c97f30c2b52bdc4de013d
generated_at: 2026-11-22T05:46:13.063997+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/repository.ts

## Purpose
The query layer for the locales module's two collections: languages (`locale`) and dictionary entries (`localeentries`). It enforces one invariant: every write to `localeentries` goes through a function here that also bumps the language's `revision`, in the same transaction. The revision is what clients use to know when to re-download, and it is also the `If-Match` fence for bulk imports. Writing a row before its bump would let a stale import slip past the fence.

## Key elements
- **Types**: `EntryInput` (`key`, `value`), `EntryChange` (`value: string | null`, where `null` deletes the key), `ImportCounts` (`created`, `updated`, `removed`).
- **`localeBase` / `entryBase`**: generic repositories built with `createRepository`. Languages are searchable by exact `tag` and boolean `active`. Entries are searchable by a text filter over both `key` and `value`, plus exact `app`.
- **Language reads**:
  - `findByTag` looks up a language by normalized tag.
  - `listActiveTags` and `listInactiveTags` return the tags of languages switched on or off.
  - `list` returns all languages sorted by tag, deliberately unpaginated.
  - `countEntriesByLocale` is a single aggregate that counts entries per language, frontend apps only (via `frontendAppIds()`), for the manifest's `entryCount`.
- **Entry reads**:
  - `listEntries(locale, app)` is sorted by key for byte-stable builds.
  - `listEntriesByApp(app)` spans all languages, sorted by `(locale, key)`, for the override overlay.
  - `listKeys` is a keys-only projection for the per-write collision check.
  - `valuesByKey` returns a key→value map that an import diffs against. It optionally takes a session.
- **Revision helpers**:
  - `bumpRevision` uses an atomic `$inc` with `timestamps: false`, so a dictionary write does not change the language's edit counter.
  - `fenceRevision` checks the open precondition (`preconditionFilter(tag, 'revision')`) inside the import's transaction. It throws `PreconditionFailedError` if nothing matches, and does no query when there is no precondition.
  - `currentRevision` reads the revision without bumping it.
- **Entry writes** (each runs in `withTransaction`):
  - `createEntry` inserts an entry and bumps.
  - `saveEntryValue` changes a value with `findOneAndUpdate` and `runValidators`. If the value is unchanged, it returns the current revision with no bump.
  - `removeEntry` deletes an entry and bumps.
- The file also contains a bulk-write function that bumps once per batch, unless nothing changed. Its body is cut off in the source I was given, so it is not described here.

## Relationships
- **`./model`**: supplies the Mongoose models, the transform appliers, and `normalizeTag`.
- **`./apps`**: `frontendAppIds()` scopes the entry count.
- **`@infrastructure/persistence/*`**:
  - `create-repository` builds the base repositories.
  - `versioning` supplies `preconditionFilter`, `PreconditionFailedError`, `fencedSave` and `rearmPrecondition`.
  - `changes` supplies `setAndUnset`.
- **`@infrastructure/runtime/database`**: `withTransaction` provides the sessions used for atomic entry writes and revision bumps.
- **`@infrastructure/i18n`**: `canonicalLocale` and `getFallbackLocale` are imported. The visible portion does not show how they are used.
- **`src/modules/locales/services/entries.ts`, `src/modules/locales/services/keys.ts`, `src/modules/locales/services/capabilities.ts`, `src/modules/locales/module.ts`, `scenarios/locales.ts`**: these are graph neighbors. They presumably consume the exported repository functions, but the visible portion does not show it.

## Notes
- `bumpRevision` takes an optional session. Omitted, the bump stands alone and is not part of the entry write's transaction. Entry writes always pass the session.
- `saveEntryValue` uses a query update rather than `save()`. The driver can re-run the transaction callback on a transient conflict, and a document already saved by the first run would make a retry's `save()` a silent no-op that still bumps.
- `listEntries` is narrowed by app in the query. Apps share key names, so otherwise a build would nest the API's `generic` entries over a client's.
- `list` and `listKeys` are unpaginated or keys-only for performance and correctness reasons stated in their comments, such as the default `findAll` limit of ten silently truncating a manifest.
