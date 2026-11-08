---
source: scripts/db/index-sync.ts
sha256: 28b4e0c11dc4650362d7fdf62923cddca7507c60372b9430054d07c7087115e9
generated_at: 2026-11-08T02:45:53.643045+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/index-sync.ts

## Purpose

Reconciles MongoDB indexes against the schemas that declare them: it creates missing indexes, replaces indexes whose options changed, drops retired indexes, and (optionally) prunes undeclared ones. This file *is* the repo's entire schema-migration mechanism — a desired state re-applied on every deploy rather than a sequenced changelog. It was split from `sync-indexes.ts` so tests can drive reconciliation per case without a live connection.

## Key elements

- **`IndexDiff`** – per-collection plan: `toCreate`, `toReplace`, `toDropRetired`, `toDropUndeclared`, `kept`.
- **`ReplacedIndex`** – an index whose options changed; dropped under its old name then rebuilt from the schema's key spec.
- **`IndexSyncOptions`** – `prune` flag; a deploy never sets it, a dev database does.
- **`hasChanges(diff)`** – true when applying the diff would create or drop anything (a `kept`-only diff is informational, not work).
- **`RegisteredModel`** (internal) – narrows the Mongoose model surface to the members actually used, preventing `any` laundering through `mongoose.models`.
- **`assertModelsRegistered()`** – throws if zero models registered, preventing a silent "0 changes" pass that would drop everything.
- **`uniqueIndexes()`** – collects every non-partial unique index declared across all schemas.
- **`findDuplicates(collection, keys)`** – aggregation that groups documents sharing a would-be-unique value; skips docs missing any key.
- **`findBlockingDuplicates(plan?)`** – reports every row a unique index would reject *before* building it; when a plan is supplied, restricts the scan to only the indexes that plan would create or replace (avoids full-collection scans on every container boot).
- **`storedIndexesOf(model)`** – returns stored indexes, returning `[]` on `NamespaceNotFound` (collection never created).
- **`classify(model, diff, options)`** – partitions Mongoose's `toDrop` list into `toReplace` (matched by stored key), `toDropRetired` (in the schema's retired set), and the rest (pruned or kept).
- **`isNamespaceNotFound(error)`** – guards against MongoDB error code 26 when listing indexes on an empty collection.

## Relationships

- **`scripts/db/sync-indexes.ts`** – the original file this was split from; that file opens a DB connection and runs the sync on import. This file exports the pure reconciliation logic it needs.
- **`src/modules.ts`** – importing `enabledModules` triggers every enabled module's `module.ts` → `model.ts` registration. A module absent from the list is never imported, so its collections are left untouched. Also used in `assertModelsRegistered` for the error message.
- **`src/infrastructure/persistence/retired-indexes.ts`** – provides `retiredIndexesOf(schema)`; the returned names are the `toDropRetired` set inside `classify`.
- **`src/infrastructure/runtime/database.ts`** – provides `JOB_MAX_TIME_MS`, applied as `maxTimeMS` on the raw aggregation in `findDuplicates` (Mongoose's global cap does not reach raw driver calls).
- **`tests/integration/scripts/db/index-sync.test.ts`** – integration test that drives the reconciliation functions directly, which was the motivation for the split from `sync-indexes.ts`.

## Notes

- **Never drops by surprise.** Undeclared indexes are kept (reported in `kept`) unless the caller explicitly passes `prune: true`. This protects an older release running after a rollback from deleting a newer release's indexes.
- **No changelog, no version.** The file is stateless: it converges the database to the declared state on every run. One-off data operations (renames, backfills, dedupes) live under `ops/`, not here.
- **Partial unique indexes are excluded** from duplicate detection: their `partialFilterExpression` selects a subset the whole-collection scan cannot model, so including them would report phantom collisions.
- **`findBlockingDuplicates` with a plan** is critical for performance: `db:bootstrap` runs on every container boot, and scanning an already-existing unique index would mean a full-collection aggregation to re-prove what the index already enforces.
- **`RegisteredModel` exists solely to keep `any` out.** Mongoose types `IndexesDiff` members as `Array<any>`; this interface names the exact fields used, narrowing at the single point of entry.
