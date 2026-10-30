---
source: tests/integration/scripts/db/index-sync.test.ts
sha256: 82846cb3f60b78a3dfa5420f18db04799cd08914bac5b6c929f7526c8111870e
generated_at: 2026-10-29T07:03:07.329876+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scripts/db/index-sync.test.ts

## Purpose

Integration test suite for the `db:sync` index-reconciliation script. It is the only suite that observes a database whose stored indexes disagree with the schemas — the normal state on a real deployment (index declared but deploy not yet run, or index deleted from a schema but still present in the collection). Every other suite runs against a fresh `mongodb-memory-server` where Mongoose `autoIndex` builds indexes unopposed, so they cannot exercise drift, pruning, or replacement paths.

## Key elements

- **`nativeDb()`** — extracts the raw MongoDB driver handle from the active Mongoose connection; used to construct index states only the driver can create.
- **`dropAllIndexes()`** — drops every index (except the undroppable `_id_`) across all collections, providing a clean slate before each scenario.
- **`RegisteredModel`** (local interface) — a typed view of a Mongoose model's `collection` and `schema.indexes()`, declared here to avoid laundering `any` from `mongoose.models` into assertions.
- **`storedKeys(model)`** / **`declaredKeys(model)`** — return `Set<string>` of index key specs (JSON-stringified) actually stored vs. schema-declared, excluding `_id_`. Handles code 26 (NamespaceNotFound) for missing collections.
- **`models()`** — narrows `Object.values(mongoose.models)` to the `RegisteredModel` shape.
- **Test cases** (all under `describe('db:sync')`):
  - *registry-walk canary* — asserts every enabled module that ships a `model.ts` on disk is actually registered.
  - *builds from nothing* — fresh-database bootstrap; every declared index must exist.
  - *exact match* — no stored index without a declaration, no declaration without a stored index.
  - *keeps undeclared index (add-only)* — drift is preserved; `hasChanges` must be false so `--check` exits 0.
  - *drops undeclared when pruning* — `planIndexSync({ prune: true })` / `applyIndexSync({ prune: true })` removes the orphan.
  - *replaces on options change* — simulates a TTL/sparse options drift; sync drops and rebuilds; a second plan is empty.
  - *drops a retired name, only that name* — uses `retireIndexes`; sibling orphan is kept.
  - *retired name not stored is a no-op* — no work generated for an already-absent retired index.

## Relationships

- **`scripts/db/index-sync.ts`** — the module under test. Imports `applyIndexSync`, `planIndexSync`, `hasChanges`, and `findBlockingDuplicates`.
- **`src/infrastructure/persistence/retired-indexes.ts`** — imports `retireIndexes` to mark schema-retired index names for the retired-index test cases.
- **`src/modules.ts`** — imports `enabledModules` to cross-check the registry-walk canary against the set of enabled module names.
- **`tests/support/database.ts`** — imports `connect` / `disconnect` for the `beforeAll` / `afterAll` Mongoose connection lifecycle.
- **`tests/support/paths.ts`** — imports `MODULES_ROOT` to resolve the on-disk module directory for the registry-walk count.

## Notes

- The suite deliberately does **not** test two-author agreement (hand-written migration vs. schema) because the codebase's design forbids a second index author; `db:sync` is the sole writer.
- The registry-walk canary counts against the **filesystem** (`MODULES_ROOT`) rather than a hardcoded integer, so it breaks on the commit that adds a module instead of silently passing over one fewer.
- `storedKeys` treats a missing collection (error code 26) as "no indexes" because sync only re-creates collections whose schema declares an index; an earlier test case may have dropped the namespace.
- The header comment notes an embedded-schema index-propagation concern (Mongoose copies embedded indexes onto the parent), but the visible test cases exercise top-level models; the embedded case is flagged as a schema-authoring mistake that would surface as an "index nobody meant to declare."
