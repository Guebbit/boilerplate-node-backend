# db/migrations/20260818160000-locale-base-language.js

## Purpose

Backfills a `baseLanguage` field on documents in the `locales` collection by extracting the primary subtag (portion before the first hyphen) from the existing `tag` field. This makes "all variants of a language" queryable in a single field instead of requiring a string split in application code.

## Key elements

- **`up(db)`** — Finds all `locales` documents where `baseLanguage` does not exist (`$exists: false`), derives the value via `String(tag ?? '').split('-')[0].trim().toLowerCase()`, and `$set`s it. Runs one `updateOne` per row.
- **`down(db)`** — `$unset`s `baseLanguage` on every document in `locales`. Safe to destroy because the value is always re-derivable from `tag` in the same document.

## Relationships

No graph neighbors are recorded.

## Notes

- **Logic is intentionally duplicated**, not imported, from `deriveBaseLanguage` in `src/modules/locales/model.ts`. The migration must stay a self-contained record of what the DB did; importing app code would couple the migration to future refactors. If `deriveBaseLanguage` changes, the migration's inline expression must be updated in lockstep.
- **Idempotent by design.** The `$exists: false` filter means re-running the migration is a no-op on already-backfilled rows and will not overwrite a manually corrected value.
- **No index is created.** The repo convention (see `20260808180000-prune-unused-indexes.js`) is to add indexes only when a query actually needs them. Adding one should be a separate, future migration.
