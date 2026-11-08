---
source: tests/integration/scripts/db/index-sync.test.ts
sha256: 82846cb3f60b78a3dfa5420f18db04799cd08914bac5b6c929f7526c8111870e
generated_at: 2026-11-08T09:48:13.220409+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scripts/db/index-sync.test.ts

## Purpose

Integration test suite for the `db:sync` index-reconciliation script. It verifies that `applyIndexSync` and `planIndexSync` correctly build, keep, replace, and drop MongoDB indexes so the database matches the schemas' declarations. These scenarios (stored indexes disagreeing with schemas) are invisible to every other suite, which runs against a fresh `mongodb-memory-server` where Mongoose `autoIndex` handles indexing unopposed.

## Key elements

- **`nativeDb()`** — returns the raw MongoDB driver handle from the active Mongoose connection.
- **`dropAllIndexes()`** — drops every index (except `_id_`) on every collection to establish a controlled starting state.
- **`RegisteredModel`** (interface) — typed structural view of a Mongoose model, declared locally to avoid laundering `any` out of `mongoose.models`.
- **`storedKeys(model)`** — returns a `Set<string>` of JSON-serialized index key specs actually stored in the collection (handles missing-collection error code 26).
- **`declaredKeys(model)`** — returns a `Set<string>` of JSON-serialized key specs the schema declares.
- **`models()`** — returns all registered Mongoose models narrowed to `RegisteredModel[]`.
- **Test cases** (under `describe('db:sync')`):
  - *registered a model from every enabled module that ships one* — canary: asserts the registry walk pulled in at least as many models as `model.ts` files exist on disk.
  - *builds every index the schemas declare, from nothing* — fresh-DB case.
  - *leaves each collection holding EXACTLY what its schema declares* — no extras, no missing.
  - *keeps an index no schema declares, and says so* — add-only default; orphan preserved and reported as `kept`.
  - *drops an undeclared index when pruning* — `prune: true` removes orphans.
  - *replaces a declared index whose options changed* — e.g. `sparse` or `expireAfterSeconds` change forces drop-and-rebuild.
  - *drops a name its model retired, and only that name* — `retireIndexes` flow.
  - *treats a retired name that is not stored as nothing to do* — idempotency of retirement.

## Relationships

- **`scripts/db/index-sync.ts`** — the code under test; supplies `applyIndexSync`, `planIndexSync`, `hasChanges`, `findBlockingDuplicates`.
- **`src/infrastructure/persistence/retired-indexes.ts`** — supplies `retireIndexes`, used to mark a specific index name as retired on a schema.
- **`src/modules.ts`** — supplies `enabledModules`, used in the registry-canary test to know which module names to look for on disk.
- **`tests/support/database.ts`** — provides `connect`/`disconnect` for the Mongoose connection lifecycle in `beforeAll`/`afterAll`.
- **`tests/support/paths.ts`** — provides `MODULES_ROOT`, the filesystem path to the modules directory, used by the disk-walking canary assertion.

## Notes

- Indexes are compared **by key spec** (`JSON.stringify(key)`), never by name, so assertions are independent of naming conventions.
- The registry canary test counts against the **filesystem** (`fs.readdirSync(MODULES_ROOT)`) rather than a hardcoded integer, so it goes stale only if a domain is added without a `model.ts`, not on an unrelated commit.
- By design, this file does **not** test two authors (schema vs. hand-written migration) agreeing with each other — the architecture makes that scenario impossible, so it is intentionally out of scope.
- `storedKeys` silently returns an empty set if the collection does not exist (MongoDB code 26), since a prior test case may have dropped it and sync only re-creates collections that declare at least one index.
- The file header references `docs/reference/data.md` for the broader data-layer design rationale.
