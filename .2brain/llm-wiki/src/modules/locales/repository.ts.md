---
source: src/modules/locales/repository.ts
sha256: 7313023172cc9496399853cec087b9f04ed15fdae1b333bc8860f2d74af60cea
generated_at: 2026-11-14T20:20:24.745752+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/repository.ts

## Purpose

Data-access layer for the locales module. Wraps every MongoDB query against the `locales`, `localeentries`, and `translations` collections behind a set of narrow, purpose-named functions. Its central invariant: every write to `localeentries` runs inside a transaction that also atomically bumps the owning language's `revision`, so a client can never observe changed entries without a changed revision, and an import's `If-Match` fence can never slip past a partially-written row.

## Key elements

- **`EntryInput` / `EntryChange` / `ImportCounts`** — small interfaces describing single-entry writes, bulk-import rows (value or `null` to delete), and import result counts.
- **`localeBase` / `entryBase`** — base CRUD+search repositories built via `createRepository`; define searchable fields (exact, boolean, text) used by higher-level services.
- **`findByTag`** — primary lookup: one language row by normalized tag.
- **`listInactiveTags` / `listActiveTags`** — `distinct('tag')` queries feeding the public manifest's on/off language sets.
- **`list`** — unpaginated, tag-sorted language list (deliberately bypasses `findAll`'s default limit of 10).
- **`countEntriesByLocale`** — single aggregation counting only frontend-app entries per locale (for manifest `entryCount`).
- **`listEntries(locale, app)`** — all entries for one (locale, app) pair, key-sorted for byte-stable builds.
- **`listEntriesByApp(app)`** — all entries for one app across locales, sorted `(locale, key)`.
- **`listKeys(locale, app)`** — projection of key-only rows for collision checks on every write.
- **`bumpRevision(tag, session?)`** — atomic `$inc` on the language's `revision`; returns the new number. Uses `timestamps: false` so dictionary writes don't disturb a name-edit's `If-Match`.
- **`fenceRevision(tag, session)`** — reads the language row inside the import's transaction and throws `PreconditionFailedError` (412) if the open `If-Match` no longer matches `revision`.
- **`valuesByKey`** — reads `(key → value)` map for diffing before an import writes.
- **`currentRevision(tag, session?)`** — reads `revision` without bumping (returned when a write is a no-op).
- **`createEntry`** — insert one entry + bump in one `withTransaction` call.
- **`saveEntryValue`** — update one entry's value + bump (or return current revision if value unchanged). Uses `findOneAndUpdate` with `runValidators` instead of `save()` to survive Mongoose's transient-conflict retry.
- **`removeEntry`** — delete one entry + bump in one transaction.
- *(truncated in source)* A bulk-import function that diffs `valuesByKey`, applies creates/updates/deletes, bumps once, and returns `ImportCounts`.

## Relationships

- **`src/modules/locales/model.ts`** — supplies `localeModel`, `localeEntryModel`, `translationModel`, the `apply*Transform` functions, `normalizeTag`, and document types.
- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository` and the `Repository` type used to build `localeBase`/`entryBase`.
- **`src/infrastructure/persistence/versioning.ts`** — provides `preconditionFilter`, `PreconditionFailedError`, `fencedSave`, `rearmPrecondition` for the `If-Match` fence logic.
- **`src/infrastructure/persistence/changes.ts`** — provides `setAndUnset` (used in the bulk-import write path).
- **`src/infrastructure/runtime/database.ts`** — provides `withTransaction`, the session wrapper for all multi-write operations.
- **`src/infrastructure/i18n/index.ts`** (barrel) — re-exports `canonicalLocale` and `getFallbackLocale` from `catalog.ts` / `locale-tag.ts`.
- **`src/modules/locales/apps.ts`** — provides `frontendAppIds()` used to scope entry counts and queries to client-facing apps.
- **`src/modules/locales/services/entries.ts`, `keys.ts`, `capabilities.ts`** — the service layer that calls the functions exported here.
- **`src/modules/locales/module.ts`** — wires this repository into the module's DI/lifecycle.
- **`scenarios/locales.ts`** — integration/test scenarios that exercise the repository's public API.

## Notes

- **Revision is the contract.** Any new write path that touches `localeentries` must go through one of the transactional functions (`createEntry`, `saveEntryValue`, `removeEntry`, bulk import) so the bump is guaranteed. A bare `entryBase.save()` or direct model write bypasses the fence.
- **`timestamps: false` on `bumpRevision`.** The language row's `updatedAt` is reserved for name/metadata edits; a dictionary write must not advance it or it will invalidate a concurrently open name-edit form's `If-Match`.
- **`list` is intentionally unpaginated.** Mongoose `findAll` defaults to a limit of 10; a deployment with >10 languages would silently truncate. If a future need for pagination arises, a separate paginated function should be added rather than modifying `list`.
- **`saveEntryValue` uses a query update, not `save()`.** Mongoose re-invokes the transaction callback on a transient write-conflict (the hot row is the language's `revision`). A document already persisted by the first attempt would make a retry's `save()` a silent no-op that still bumps the revision.
- **`entryBase` text search covers both `key` and `value`.** Callers do not need to know whether a query term is a key or a translation; the repository handles the disambiguation.
