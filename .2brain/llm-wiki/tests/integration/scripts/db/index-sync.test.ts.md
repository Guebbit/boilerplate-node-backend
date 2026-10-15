---
source: tests/integration/scripts/db/index-sync.test.ts
sha256: e19322f223a10db2892fdab2767c5fd3e9a1e9458b4af3c8a4e5f06dc7270e31
generated_at: 2026-10-15T12:53:51.700030+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scripts/db/index-sync.test.ts

## Purpose

Integration test suite for the `db:sync` index-reconciliation script. It verifies that `applyIndexSync` brings the live database into exact agreement with schema-declared indexes — building missing ones, dropping orphaned ones, and refusing to create a unique index when existing rows already violate uniqueness. It also validates the `--check` (dry-run) path and the pre-flight duplicate scan.

## Key elements

- **`nativeDb()`** — returns the raw MongoDB driver handle from the open Mongoose connection; used for index operations the driver exposes that Mongoose's API does not (e.g. `createIndex` with TTL, `dropIndexes`).
- **`dropAllIndexes()`** — wipes every non-`_id_` index across all collections so each test starts from a known baseline.
- **`RegisteredModel`** (local interface) — a typed view over `mongoose.models` entries (`collection.name`, `collection.indexes()`, `schema.indexes()`), declared locally to avoid laundering `any` from `Model<any>` into assertions.
- **`storedKeys(model)` / `declaredKeys(model)`** — normalize stored and declared indexes into `Set<string>` of `JSON.stringify(key)` for key-based (name-independent) comparison.
- **`models()`** — `Object.values(mongoose.models)` cast through `RegisteredModel`.
- **Test cases** (all under `describe('db:sync')`):
  - Registry completeness — every enabled module that ships a `model.ts` has a registered Mongoose model.
  - Build-from-nothing — after `applyIndexSync`, every declared index exists.
  - Exact agreement — no extra stored indexes, no missing declared indexes.
  - Orphan drop — a hand-created index is removed on the next sync.
  - Retired TTL drop — a `leases.updatedAt_ttl` index (assembled from parts to avoid a live name reference) is removed.
  - Idempotency — second `planIndexSync()` resolves to `[]`.
  - Dry-run — `planIndexSync()` reports work without mutating; plan is stable across calls.
  - Scan scoping — `findBlockingDuplicates` with a scoped plan reports only the named collection's collisions.
  - Unique-violation refusal — `applyIndexSync` rejects with a descriptive error when rows already violate a unique key.

## Relationships

- **`scripts/db/index-sync.ts`** — the system under test; provides `applyIndexSync`, `planIndexSync`, and `findBlockingDuplicates`.
- **`src/modules.ts`** — supplies `enabledModules`, which the registry-completeness test uses to determine which module directories should own a collection.
- **`tests/support/database.ts`** — provides `connect` / `disconnect` used in `beforeAll` / `afterAll` to open and close the in-memory MongoDB connection.
- **`tests/support/paths.ts`** — provides `MODULES_ROOT`, the filesystem path to the modules directory, used by the registry-completeness test to `readdirSync` and check for `model.ts` files.

## Notes

- Index comparison is always **by key spec, not by name**, so renames do not cause false drift.
- The retired TTL index name is assembled via `['leases','updatedAt','ttl'].join('_')` deliberately to keep the retired identifier out of source.
- The duplicate-scan scoping test inserts colliding rows into **two** collections (`users` and `carts`) so that an unscoped scan would report both — proving the scoped call actually filters.
- The unique-violation test writes duplicate rows through the **driver** (not the model) because the model's own unique index is precisely what this case asserts can be absent before sync runs.
- The file's top-of-file docblock documents the design invariant: exactly one author of an index (`model.ts` declares, `syncIndexes` enforces), so no test exercises "two authors agreeing."
