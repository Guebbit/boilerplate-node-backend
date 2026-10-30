---
source: scripts/db/index-sync.ts
sha256: 28b4e0c11dc4650362d7fdf62923cddca7507c60372b9430054d07c7087115e9
generated_at: 2026-10-29T01:32:51.028309+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/index-sync.ts

## Purpose

Idempotent index reconciliation: compares what MongoDB actually stores against what the enabled modules' schemas declare, and adds (or replaces) what is missing. This is the entirety of "schema migration" in this repo—there is no changelog or version; a desired state is re-applied on every deploy. It never drops an undeclared index by surprise; pruning is opt-in via the `prune` option so a rolled-back release cannot delete a newer release's indexes.

## Key elements

- **`ReplacedIndex`** – An index whose options changed: the old name to drop and the key spec to rebuild.
- **`IndexDiff`** – Per-collection reconciliation result: `toCreate`, `toReplace`, `toDropRetired`, `toDropUndeclared`, and `kept`.
- **`IndexSyncOptions`** – `{ prune?: boolean }`; when `true`, undeclared indexes are dropped. A deploy never sets it; a dev database does.
- **`hasChanges(diff)`** – Returns `true` when applying the diff would create, replace, or drop an index (`kept` alone does not count).
- **`findBlockingDuplicates(plan?)`** – Scans collections for duplicate groups that would cause a unique-index `createIndex` to fail. Accepts an optional `IndexDiff[]` to restrict the scan to indexes this plan would create or replace (avoids a full-collection re-scan on every container boot when the index already exists).
- **`classify(model, diff, options)`** – Uses `diffIndexes()` output plus the stored key map and the retired-index registry to partition `toDrop` names into `toReplace`, `toDropRetired`, and the undeclared rest.
- **`registeredModels()`** – Narrows `mongoose.models` to a typed `RegisteredModel[]` so downstream access stays free of `any`.
- **`assertModelsRegistered()`** – Throws if no models registered, preventing a vacuous "0 changes" success.
- **`findDuplicates(collection, keys)`** – Aggregation that groups documents by all key fields (excluding documents missing any key) and returns groups with count > 1, sorted worst-first. Bounded by `JOB_MAX_TIME_MS`.
- **`isNamespaceNotFound(error)`** – Detects MongoDB error code 26 so `storedIndexesOf` returns `[]` for a collection that was never created.
- **`retiredIndexesOf`** (imported) – Supplies the set of explicitly retired index names for a schema, distinguishing "retired" from "undeclared."

## Relationships

- **`src/modules.ts`** – Imports `enabledModules`. Importing it pulls in every enabled module's `module.ts` → `model.ts`, which registers the models this file reconciles. Also used in the `assertModelsRegistered` error message.
- **`src/infrastructure/persistence/retired-indexes.ts`** – `retiredIndexesOf` is called inside `classify` to separate explicitly retired index names from truly undeclared ones.
- **`src/infrastructure/runtime/database.ts`** – `JOB_MAX_TIME_MS` is passed as `maxTimeMS` to the raw driver aggregation in `findDuplicates`, because Mongoose's global `maxTimeMS` does not reach a `.collection().aggregate()` call.
- **`scripts/db/sync-indexes.ts`** – This file was split out of `sync-indexes.ts` so a test can drive the reconciliation per-case without opening a connection on import. `sync-indexes.ts` is the thin entry point that connects and then calls into this module.
- **`tests/integration/scripts/db/index-sync.test.ts`** – Integration test that exercises the plan/apply cycle against a real MongoDB instance.

## Notes

- **No changelog, no version.** The design is deliberately state-based: every deploy re-derives the desired index set from schemas and applies the delta. There is nothing to sequence.
- **One-off data changes** (renames, backfills, dedupes) are out of scope for this file; they live as hand-run scripts under `ops/` (see `docs/reference/data.md`).
- **Partial unique indexes are excluded** from the duplicate scan: a partial filter selects a subset the whole-collection aggregation cannot model, so scanning would report phantom collisions the index would not actually reject.
- **`_id_` appears in `storedIndexesOf`** results because `listIndexes` includes it; `classify` treats it like any other stored name.
- **Mongoose typing workaround:** `RegisteredModel` is declared (not imported) because `mongoose.models` is `Record<string, Model<any>>` and `IndexesDiff` members are `Array<any>`. Naming only the members actually used narrows the `any` at the single entry point.
