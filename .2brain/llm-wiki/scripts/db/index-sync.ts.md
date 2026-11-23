---
source: scripts/db/index-sync.ts
source_sha256: 6b4b22bd1274141ee51f295e0ff9a776c06f4dfacd6541a7e361d4ac8ce6a2c1
context_sha256: ff0da5d5a93504b1b0686f6a77249d59187f0924283b282dfcd1b10614719b5a
generated_at: 2026-11-22T02:01:16.131191+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/db/index-sync.ts

## Purpose
Reconciles the database's indexes with the ones declared by module schemas. This is the repo's whole "schema migration" story: a module's `model.ts` is the sole author of an index, and this file compares what Mongo stores against what the schemas declare and adds what is missing. The desired state is re-applied on every deploy, with no changelog or version. Nothing is dropped by surprise: undeclared indexes are kept and reported unless the caller asks to prune. Non-derivable data changes (renames, backfills, dedupes) are one-off scripts under `ops/`. The logic is split from `sync-indexes.ts` so tests can drive it, since that file opens a connection and runs on import.

## Key elements
- `ReplacedIndex`: an index whose options changed. It holds the stored `name` to drop and the declared `key` to rebuild.
- `IndexDiff`: one collection's plan with `collection`, `toCreate`, `toReplace`, `toDropRetired`, `toDropUndeclared` and `kept`.
- `IndexSyncOptions`: `{ prune?: boolean }`. When set, undeclared indexes are dropped too. The comment says a deploy never sets it and a dev database does.
- `hasChanges(diff)`: true if applying the diff would create or drop an index. `kept` alone does not count.
- `findBlockingDuplicates(plan?)`: scans for documents that would violate unique indexes before anything is built, and returns one human-readable line per colliding value.
  - With a `plan`, it only checks unique indexes that plan would create or replace. Without one, it audits every unique index.
  - It collects every collision in one pass, because `createIndex` reports only the first.
- `RegisteredModel`: a narrow local interface over the parts of a Mongoose model that are used (`collection`, `schema.indexes`, `diffIndexes`, `createIndexes`). It keeps `any` from leaking in from `mongoose.models`.
- Internal helpers:
  - `assertModelsRegistered` throws if no models registered.
  - `uniqueIndexes` lists the schemas' unique indexes, skipping partial ones.
  - `findDuplicates` runs the `$group` aggregation, excluding documents missing any key.
  - `isNamespaceNotFound` checks for Mongo error code 26.
  - `storedIndexesOf` lists a model's stored indexes and returns `[]` when the collection does not exist yet.
  - `classify` sorts the names Mongoose says are undeclared into replaced, retired and the rest, pairing a replaced index's old name in `toDrop` with its key in `toCreate` through the stored key.
- The doc comments and `IndexSyncOptions` refer to `planIndexSync` and `applyIndexSync`. The rest of the file is not shown, so these exports are not described here.

## Relationships
- `scripts/db/sync-indexes.ts`: the entry point that opens a connection and runs on import. This file holds the reconciliation logic it relies on.
- `src/modules.ts`: provides `enabledModules`. Importing it registers every enabled module's models. A disabled module's models never register, so its collections are left untouched.
- `src/infrastructure/runtime/database.ts`: provides `JOB_MAX_TIME_MS`, used as `maxTimeMS` on the raw duplicate-scan aggregation.
- `src/infrastructure/persistence/retired-indexes.ts`: provides `retiredIndexesOf(schema)`, which `classify` uses to identify retired index names.
- `tests/integration/scripts/db/index-sync.test.ts`: the integration test that drives the reconciliation.
- `src/infrastructure/adapters/logger.ts`: a graph neighbor, but no use of it is visible in the shown portion.

## Notes
- `assertModelsRegistered` exists because an empty walk would report "0 changes" and pass.
- The duplicate scan uses the raw driver, so Mongoose's global `maxTimeMS` does not apply and the job ceiling is set by hand.
- Partial unique indexes are skipped by the duplicate scan, because the scan cannot model their filter.
- Dotted key names are rewritten with `_` for the `$group` `_id` fields.
- `db:bootstrap` runs on every container boot, which is why `findBlockingDuplicates` accepts a plan to avoid full-collection scans for indexes that already exist.
