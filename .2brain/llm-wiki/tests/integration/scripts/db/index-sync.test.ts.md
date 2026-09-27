---
source: tests/integration/scripts/db/index-sync.test.ts
sha256: e26b39d0ea7f4f050f07d3f4fe8ee0b3ac7e43c866a8aa61698736df28a55cc5
generated_at: 2026-09-27T15:58:40.710035+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scripts/db/index-sync.test.ts

## Purpose

Integration test for the `db:sync` script. It constructs database states that no other suite can produce — stored indexes that disagree with schema declarations (orphaned, missing, or both) — and asserts `applyIndexSync` reconciles them. Because every other test suite runs against a fresh `mongodb-memory-server` where `autoIndex` builds indexes unopposed, only this file exercises the drift-and-repair path that real deployments hit.

## Key elements

- **`nativeDb()`** — returns the raw MongoDB driver handle from `mongoose.connection`; used to construct states (orphan indexes, colliding documents) only the driver can create.
- **`dropAllIndexes()`** — drops every index on every collection except `_id_`, giving each test a clean starting point.
- **`RegisteredModel`** (local interface) — a typed projection of a registered Mongoose model (`collection.name`, `collection.indexes()`, `schema.indexes()`) declared locally to avoid laundering `any` from `mongoose.models` into assertions.
- **`storedKeys(model)`** — collects the set of index key specs actually present on a collection, excluding `_id_`.
- **`declaredKeys(model)`** — collects the set of index key specs the schema declares.
- **`models()`** — returns `Object.values(mongoose.models)` narrowed to `RegisteredModel[]`.
- **Test cases** (in `describe('db:sync')`):
  - Registry walk covers every enabled module that ships a `model.ts` (counted against disk, not a literal).
  - Builds every declared index from an empty database.
  - After sync, each collection holds *exactly* the declared set (no extras, no gaps).
  - Drops a hand-created orphan index on second sync.
  - Is a no-op (empty plan) on the second pass.
  - `planIndexSync()` reports pending work without executing it (`--check` mode).
  - `findBlockingDuplicates` scans only the collections named in the plan, not all collections.
  - Refuses to build a unique index when existing rows already violate it (reports the colliding value, throws).

## Relationships

- **`scripts/db/index-sync.ts`** — the module under test; this file imports `applyIndexSync`, `planIndexSync`, and `findBlockingDuplicates` from it.
- **`src/modules.ts`** — imports `enabledModules` to cross-check that the registry walk registered a model for every enabled module that owns a collection.
- **`tests/support/database.ts`** — provides `connect` / `disconnect` for the Mongoose connection lifecycle (fresh `mongodb-memory-server`).
- **`tests/support/paths.ts`** — provides `MODULES_ROOT` so the registry-walk test can count `model.ts` files on disk rather than hardcoding a number.

## Notes

- Index comparison is always by **key spec** (`JSON.stringify` of the key object), never by index name, so the tests are independent of naming conventions.
- The header comment explicitly states this file does **not** test two-author index agreement; by design `model.ts` is the sole author and `syncIndexes` the sole executor.
- The `RegisteredModel` interface is deliberately re-declared here (rather than imported) for the same `any`-laundering reason given in `index-sync.ts` itself.
- The module-ownership canary test reads the filesystem (`fs.readdirSync` + `fs.existsSync`) rather than asserting a fixed integer, so it fails on the commit that *adds* a domain with a missing model, not on some arbitrary future count mismatch.
- Colliding-document tests insert data through the **driver** (`nativeDb().collection(...).insertMany(...)`) rather than the Mongoose model, because the model's own unique index is exactly what the test proves may be absent.
