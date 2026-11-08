---
source: src/modules/locales/repository.ts
sha256: becf7aef9e3a5722eee82c951c586cad7e268479643f57a3f4dfe1960174179d
generated_at: 2026-11-08T06:24:10.385465+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/repository.ts

## Purpose

Data-access layer for the locales module. Owns every MongoDB query against the `locale` (languages) and `localeEntry` (key/value strings) collections and enforces one invariant that callers must not be trusted with: every successful write to an entry also atomically bumps the language's `revision` counter so clients know when to re-download.

## Key elements

- **`EntryInput` / `EntryChange` / `ImportCounts`** — interfaces describing single-write payloads, bulk-import items (`null` value = delete), and the resulting created/updated/removed tally.
- **`localeBase` / `entryBase`** — base CRUD + search repositories built via `createRepository`; define searchable filters (tag, active, text-over-both-columns for entries, app).
- **`findByTag`** — the canonical "look up a language" entry point used by every route in the module.
- **`listInactiveTags` / `listActiveTags`** — `distinct` queries feeding the public manifest's served/excluded language lists.
- **`list`** — unpaginated, tag-sorted language listing (avoids `findAll`'s default 10-row limit).
- **`countEntriesByLocale`** — single aggregate returning a `Map<locale, count>` of downloadable (frontend-app) entries.
- **`listEntries` / `listEntriesByApp` / `listKeys`** — targeted reads narrowed by `(locale, app)` or `app` alone; sorted for byte-stable builds.
- **`bumpRevision`** — atomic `$inc` on `revision`; returns the new number.
- **`valuesByKey`** — loads the full key→value map for a `(locale, app)` pair (used by import diffing).
- **`currentRevision`** — read-only revision lookup (used when a write is a no-op).
- **`createEntry` / `saveEntryValue` / `removeEntry`** — single-row mutations, each followed by `bumpRevision`; `saveEntryValue` short-circuits (no write, no bump) when the value is unchanged.
- **`importEntries`** — bulk upsert + delete in a **single transaction** (`withTransaction`), diffing against existing values so unchanged keys are neither written nor counted; bumps revision once after the batch.

## Relationships

- **`./model`** — provides the Mongoose models (`localeModel`, `localeEntryModel`, `translationModel`), document→DTO transforms, and `normalizeTag`.
- **`@infrastructure/persistence/create-repository`** — supplies `createRepository` (the generic CRUD/search factory) and the `Repository` type used for `localeBase`/`entryBase`.
- **`@infrastructure/persistence/changes`** — imports `setAndUnset` (used in update paths).
- **`./apps`** — imports `frontendAppIds()` so entry counts and lists are scoped to downloadable (frontend) apps only.
- **`@infrastructure/runtime/database`** — imports `withTransaction` for the atomic bulk-write in `importEntries`.
- **`@infrastructure/i18n`** (catalog, index) — imports `getFallbackLocale`; the i18n runtime and catalog builder consume the data this repository serves.
- **`src/modules/locales/services/*`** (entries, translations, keys, languages, messages, capabilities) — the consumer layer that calls the functions exported here.
- **`src/modules/locales/module.ts`** — wires this repository into the services.
- **`scenarios/locales.ts`** — integration/test scenarios that exercise these query paths.

## Notes

- **Revision bump is deliberately non-transactional** for single writes (rows-then-counter). A crash between the two leaves a client under-fetching once, never caching a stale dictionary as current.
- **`importEntries` *is* transactional** (the repo's first). A crash mid-batch would otherwise leave stale keys surviving a `replace`-mode import.
- **`bumpRevision` uses `$inc`**, not read-modify-write, so concurrent imports each produce their own bump.
- **`saveEntryValue` and `importEntries` skip writes for unchanged values** to avoid stamping `updatedAt` and to prevent a no-op import from advancing the revision.
- **Entry text search covers both `key` and `value`** columns in one filter; callers do not choose which column to search.
- **`listEntries` narrows by both `locale` and `app`** because apps share key names; an unfiltered read would leak another app's strings into a build.
- **`bulkWrite` is excluded from Mongoose's global `maxTimeMS`** on purpose — its size is bounded by the caller's request body.
