---
source: src/modules/locales/repository.ts
sha256: 79618fab15db0b22426451d0a6ad784a7e795cb779b475e66d3bc5ff037d80e6
generated_at: 2026-09-27T15:00:08.380347+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/repository.ts

## Purpose

Encapsulates all database queries for the three locales collections (languages, locale entries, translations) and enforces one structural invariant: every write path to `localeentries` goes through a function in this file that also bumps the language's `revision` counter, so no service can mutate an entry without signaling clients to re-fetch.

## Key elements

- **`EntryInput`** / **`ImportCounts`** / **`LocaleCascadeCounts`** — small export interfaces describing write payloads and result tallies.
- **`localeBase`**, **`entryBase`**, **`translationBase`** — `createRepository` instances wiring each Mongoose model to its transform and (where applicable) a searchable schema.
- **`findByTag`** / **`list`** — language lookups; `list` is deliberately unpaginated (a deployment has only a handful of languages).
- **`countEntriesByLocale`** — single aggregation returning a `Map<locale, count>`, restricted to frontend tenants so the manifest doesn't advertise strings a client cannot download.
- **`listEntries`** / **`listEntriesByTenant`** / **`listKeys`** — read helpers scoped by `(locale, tenant)`; `listKeys` projects only the `key` column for cheap collision checks on every write.
- **`bumpRevision`** — atomic `$inc` on the language document's `revision` field; returns the new value.
- **`createEntry`** / **`saveEntryValue`** / **`removeEntry`** — single-entry write paths; each calls `bumpRevision` after the write.
- **`importEntries`** — bulk upsert (and optional `deleteMany` for `replace` mode) inside `withTransaction`; the repository's first and only transaction. Bumps revision once for the whole batch.
- **`deleteLocaleCascade`** — removes entries and translations for a locale, then the language row itself (cascades first, language last).
- **`findEntityTranslations`** / **`findEntityLocale`** — read helpers over the translations collection.
- **`resolveEntityFields`** — batch-resolves translated fields for a set of entity IDs across ordered locale candidates, merging more-specific locales over less-specific ones field-by-field.

## Relationships

- **`./model`** — imports all three Mongoose models, their apply-transform functions, and `normalizeTag`.
- **`@infrastructure/persistence/create-repository`** — provides the `createRepository` factory and `Repository` type used for the three base repos.
- **`@infrastructure/runtime/database`** — provides `withTransaction`, used by `importEntries`.
- **`./tenants`** — provides `frontendTenantIds()`, used to scope `countEntriesByLocale` to downloadable tenants.
- **`./module`** — the DI module that wires this repository into the services layer.
- **`./services/*`** (capabilities, entries, keys, languages, messages, translations) — the consumers of these repository functions.
- **`scenarios/locales`**, **`./tests/factories`**, **`./tests/integration/model.test`** — test/scenario code that exercises this file's behavior end-to-end.

## Notes

- The revision bump is **deliberately not** in the same transaction as the entry write: the ordering is rows-first, then counter. A crash in between means a client under-fetches once (harmless); the opposite ordering would let a client cache a stale dictionary as current.
- `importEntries` **is** transactional (upsert + `deleteMany` together) because a partial `replace` leaving stale keys violates the caller's contract — unlike the revision bump, there is no safe degradation.
- `list` bypasses the base repository's `findAll` default page limit (10) by querying the model directly; a deployment growing past 10 languages would be silently truncated otherwise.
- `resolveEntityFields` walks `localeCandidates` in **reverse** when merging, so the most-specific locale's fields overwrite a fallback's on a per-field basis (a locale may translate only a subset of an entity's fields).
- `deleteLocaleCascade` runs the two child-cascade `deleteMany` calls in parallel, then deletes the language row sequentially — an interruption after cascades but before the language row leaves a valid "empty language" state rather than orphans.
