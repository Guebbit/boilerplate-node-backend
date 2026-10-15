---
source: src/modules/locales/repository.ts
sha256: 2d2436e110ac52ae56581f93cf67ff0c604d7073fa9e6d61be7314e58e1a4747
generated_at: 2026-10-15T10:44:38.972764+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/repository.ts

## Purpose

Data-access layer for the locales module. Provides all query and write operations over the `locales` (languages) and `localeentries` collections, and enforces a single invariant: every write to entries atomically bumps the locale's `revision` counter, so no service call can mutate an entry without signalling to clients that their cached dictionary is stale.

## Key elements

- **`EntryInput`** / **`ImportCounts`** / **`LocaleCascadeCounts`** — exported interfaces describing a single key/value write, bulk-import result counts, and cascade-delete counts respectively.
- **`localeBase`** / **`entryBase`** — base CRUD/search repositories built via `createRepository`, with model-specific transforms and searchable-field definitions.
- **`findByTag`** — normalized-tag lookup; the entry point every route in the module uses.
- **`list`** — unpaginated language list sorted by tag (small set by construction).
- **`countEntriesByLocale`** — single aggregation returning a `Map<locale, count>` of downloadable entries (frontend apps only).
- **`listEntries`** / **`listEntriesByApp`** / **`listKeys`** / **`valuesByKey`** — read helpers scoped to `(locale, app)` or `app`, sorted for byte-stable builds.
- **`bumpRevision`** — atomic `$inc` on the revision field; returns the new value.
- **`currentRevision`** — read-only revision fetch for no-op writes.
- **`createEntry`** / **`saveEntryValue`** / **`removeEntry`** — single-entry writes, each paired with a revision bump (or short-circuit if the value is unchanged).
- **`importEntries`** — bulk upsert + optional `deleteMany` inside one `withTransaction`; diffs against existing values to skip no-op rows; bumps revision once (or not at all if nothing changed).
- **`deleteLocaleCascade`** — removes entries and translations for a language before deleting the language row itself, preventing orphan rows.

## Relationships

- **`src/modules/locales/model.ts`** — source of `localeModel`, `localeEntryModel`, `translationModel`, all transform functions, and `normalizeTag`.
- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository` and the `Repository` type used to build `localeBase` and `entryBase`.
- **`src/infrastructure/persistence/changes.ts`** — provides `setAndUnset` (imported for field-level write helpers).
- **`src/infrastructure/runtime/database.ts`** — provides `withTransaction`, used by `importEntries` to keep the upsert and `deleteMany` atomic.
- **`src/modules/locales/apps.ts`** — provides `frontendAppIds`, used to filter `countEntriesByLocale` to client-downloadable apps only.
- **`src/modules/locales/services/entries.ts`**, **`languages.ts`**, **`translations.ts`**, **`keys.ts`**, **`messages.ts`**, **`capabilities.ts`** — consumer services that call into this repository's exported functions.
- **`src/modules/locales/module.ts`** — wires this repository into the module's service graph.
- **`src/modules/locales/tests/integration/model.test.ts`**, **`src/modules/locales/tests/factories.ts`** — integration tests and fixture factories exercising these queries.
- **`scenarios/locales.ts`** — end-to-end scenario exercising the locales feature surface.

## Notes

- **Deliberately non-transactional single writes:** `createEntry`, `saveEntryValue`, and `removeEntry` perform the entry write and the revision bump as two separate operations (rows-then-counter). A crash between them causes a client to under-fetch once; it never caches a stale dictionary as current.
- **`importEntries` IS transactional:** the bulk upsert and `deleteMany` run in a single `withTransaction` because a partial replace would silently leave removed keys alive.
- **Revision uses `$inc`, not read-modify-write:** concurrent imports each get their own bump; a read-modify-write would lose one, leaving a client believing it is current.
- **`list` is unpaginated by design:** `findAll`'s default limit of 10 would silently truncate a small language manifest.
- **`listEntries` filters by both `locale` and `app`:** apps share key names, so omitting the `app` filter would nest one app's keys over another's in a build output.
- **`importEntries` skips unchanged rows:** avoids stamping `updatedAt` on re-sent identical values and avoids counting them as "updated."
- **`deleteLocaleCascade` order matters:** entries and translations are deleted *before* the language row, so an interrupted cascade leaves a briefly-empty language rather than orphaned rows that a re-created language would silently inherit.
