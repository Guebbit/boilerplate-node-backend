---
source: scripts/db/index-sync.ts
sha256: 49362b38094dbc820cc63337aa4ba57e6b9f8fa9a9f982c6d7d0161ef7078dc6
generated_at: 2026-10-14T07:13:18.279310+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/index-sync.ts

## Purpose

Declarative index reconciliation for MongoDB: compares what the database currently stores against what registered Mongoose schemas declare, then creates missing indexes and drops undeclared ones. This is the repo's entire "schema migration" mechanism — a desired state re-applied on every deploy rather than a sequenced changelog. Split out of `sync-indexes.ts` so the reconciliation logic can be driven per-case by tests without opening a live connection.

## Key elements

- **`IndexDiff`** (interface) — per-collection plan: collection name, index names to drop, key specs to create.
- **`RegisteredModel`** (interface, internal) — narrows a Mongoose model to just `collection.name`, `schema.indexes()`, and `diffIndexes()`; prevents `any` from laundering through `mongoose.models: Map<string, Model<any>>`.
- **`UniqueIndex`** (interface, internal) — collection name, JSON key spec, and the field names of a non-partial unique index.
- **`assertModelsRegistered()`** — throws if zero models registered, preventing a silent "0 changes" no-op.
- **`uniqueIndexes()`** — flattens all non-partial unique indexes across registered schemas.
- **`findDuplicates(collection, keys)`** — raw-driver aggregation that groups documents sharing the same values on all index keys; excludes docs missing any key.
- **`findBlockingDuplicates(plan?)`** *(exported)* — reports every row that would violate a unique index the plan would create (or all unique indexes if `plan` is omitted). Returns human-readable lines; empty when clean.
- **`planIndexSync()`** *(exported)* — dry-run via `model.diffIndexes()`; returns only collections that would change.
- **`applyIndexSync()`** *(exported)* — runs `planIndexSync`, pre-flights with `findBlockingDuplicates`, throws if any unique constraint would be violated, then calls `mongoose.connection.syncIndexes()`.

## Relationships

- **`scripts/db/sync-indexes.ts`** — the original combined file. It opens a DB connection and executes the sync on import; this file extracts the testable reconciliation core so `sync-indexes.ts` can delegate to it after connecting.
- **`src/infrastructure/runtime/database.ts`** — supplies `JOB_MAX_TIME_MS`, passed as `maxTimeMS` on the duplicate-scanning aggregation (Mongoose's global timeout does not reach raw driver calls).
- **`src/modules.ts`** — importing `enabledModules` is the side-effect that pulls in every enabled module's `module.ts` → `model.ts`, registering models with Mongoose before this file reads `mongoose.models`.
- **`tests/integration/scripts/db/index-sync.test.ts`** — integration tests that call `planIndexSync` / `findBlockingDuplicates` against a live MongoDB instance to verify reconciliation behavior per scenario.

## Notes

- **No versioning or changelog.** State is re-applied idempotently; there is nothing to sequence. One-off data fixes (renames, backfills, dedupes) live under `ops/` and are run manually.
- **Partial indexes are excluded from the duplicate scan.** Their `partialFilterExpression` selects a subset the whole-collection aggregation cannot model, so scanning would report phantom collisions.
- **`findBlockingDuplicates` with a `plan` argument only scans indexes the plan would *create*.** Without a plan it audits all unique indexes. This avoids re-scanning production data for indexes that already exist on every container boot.
- **`createIndex` aborts on the first violating document.** This script pre-collects *all* violations in one pass so a single run reports the full scope of the problem.
- **`assertModelsRegistered` is a deliberate guard:** without it, an empty model set would yield an empty plan, pass the duplicate check, and `syncIndexes()` would drop every index on every collection — reported as a successful "0 changes" run.
