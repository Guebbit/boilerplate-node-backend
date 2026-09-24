---
source: scripts/db/index-sync.ts
sha256: ca4e6f2e40b1ad64409ca207b0ba8e7b7bdfc51a0381cd22ebba42a1f6a4380c
generated_at: 2026-09-23T17:24:07.062249+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/index-sync.ts

## Purpose

Declarative index reconciliation: compares what MongoDB stores against what Mongoose schemas declare, then creates missing indexes and drops undeclared ones. This is the entire "schema migration" mechanism in this repo — no changelog, no versioning; the desired state is re-applied on every deploy. One-off data operations (renames, backfills, dedupes) are out of scope and live under `ops/`. Split out of `sync-indexes.ts` so an integration test can drive reconciliation per case without opening a live connection.

## Key elements

- **`IndexDiff`** (exported interface) — one collection's gap: `collection`, `toDrop` (index names), `toCreate` (key specs).
- **`RegisteredModel`** (internal interface) — structural subset of a Mongoose model (`collection`, `schema.indexes`, `diffIndexes`) that narrows `mongoose.models` away from `Model<any>` at the single point it enters this file.
- **`UniqueIndex`** (internal interface) — collection + key JSON + field names for a unique, non-partial index.
- **`registeredModels()`** — returns all registered models as `RegisteredModel[]`.
- **`assertModelsRegistered()`** — throws if zero models are registered, preventing a vacuous "0 changes" pass that would drop every index.
- **`uniqueIndexes()`** — flattens all unique, non-partial index declarations across registered models.
- **`findDuplicates(collection, keys)`** — aggregation that groups documents sharing values on all `keys` and returns colliding groups (sorted worst-first).
- **`findBlockingDuplicates(plan?)`** (exported) — reports every row that would violate a unique index. Optionally scoped to only the indexes `plan` would create (avoids re-scanning already-enforced indexes on container boot).
- **`planIndexSync()`** (exported) — dry-run; returns an `IndexDiff[]` with only collections that would change.
- **`applyIndexSync()`** (exported) — runs `planIndexSync`, pre-flights via `findBlockingDuplicates`, throws on duplicates, then calls `mongoose.connection.syncIndexes()`.

## Relationships

- **`scripts/db/sync-indexes.ts`** — Production entry point that opens a Mongoose connection and calls the reconciliation on import. This file is the extracted, testable core it delegates to.
- **`src/modules.ts`** — Supplies `enabledModules`, whose import side-effect registers every enabled module's models. A module absent from that list has its collections left entirely untouched (no drop, no create).
- **`tests/integration/scripts/db/index-sync.test.ts`** — Integration test that drives `planIndexSync` / `applyIndexSync` / `findBlockingDuplicates` against a real Mongo instance, case by case.

## Notes

- **Partial unique indexes are excluded** from duplicate detection: their `partialFilterExpression` selects a subset the aggregation cannot model, so a whole-collection scan would report false collisions.
- **`syncIndexes()` is destructive by design**: it drops _every_ index on a registered collection that the schema does not declare (except `_id_`). This is why `assertModelsRegistered` exists — an empty registry would mean "drop everything."
- **`findBlockingDuplicates` defaults to scanning all unique indexes** when called without a `plan` argument (audit mode); pass the plan to limit the scan to indexes about to be created, which matters because `db:bootstrap` runs on every container start.
- **Dots in key names** are handled in `findDuplicates` by replacing `.` with `_` in the `$group` `_id` (MongoDB's aggregation limitation).
- **`planIndexSync` returns an empty array** when the database already matches — not a list of zero-diff entries.
