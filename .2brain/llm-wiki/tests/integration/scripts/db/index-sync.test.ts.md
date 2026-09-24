---
source: tests/integration/scripts/db/index-sync.test.ts
sha256: b1fe2355bd05744fd599c5bc8b46ece7615e1480dcf72ade82981001a2beb62e
generated_at: 2026-09-23T20:07:11.173344+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scripts/db/index-sync.test.ts

## Purpose

Integration tests that prove `db:sync` reconciles a database's stored indexes with what the Mongoose schemas declare—both building missing indexes and dropping undeclared ones. It exists because no other test suite can construct a database whose indexes _disagree_ with the schemas (they all run against a fresh `mongodb-memory-server` where `autoIndex` builds everything unopposed), so this file is the only place that state is exercised.

## Key elements

- **`nativeDb()`** — returns the raw Mongo driver `db` handle for operations only the driver can perform (creating orphan indexes, inspecting raw index lists).
- **`dropAllIndexes()`** — removes every index (except the undroppable `_id_`) from every collection to establish a known starting state.
- **`RegisteredModel`** (interface) — a typed narrow of `mongoose.models` entries (`collection.name`, `collection.indexes()`, `schema.indexes()`) so assertions avoid `any` laundering.
- **`storedKeys(model)`** / **`declaredKeys(model)`** — normalize stored and schema-declared indexes into `Set<string>` of JSON key specs (excluding `_id_`) for set-based comparison.
- **`models()`** — narrows `Object.values(mongoose.models)` into `RegisteredModel[]`.
- **Test suite (`describe('db:sync')`)** — eight cases covering: registry canary (every enabled module that owns a `model.ts` actually registered a model), build-from-empty, exact stored-vs-declared equality, orphan-index drop, idempotent second pass, `--check` dry-run plan, scoped duplicate scan (`findBlockingDuplicates`), and refusal to create a unique index over violating rows.

## Relationships

- **`scripts/db/index-sync.ts`** — the system under test; this file imports `applyIndexSync`, `planIndexSync`, and `findBlockingDuplicates` from it.
- **`src/modules.ts`** — provides `enabledModules`, used by the registry canary to cross-check that every enabled module directory containing a `model.ts` actually registered a model with Mongoose.
- **`tests/support/database.ts`** — provides `connect`/`disconnect` lifecycle hooks that spin up and tear down the `mongodb-memory-server` instance for the suite.

## Notes

- The canary test counts model registrations against the **filesystem** (`fs.readdirSync(MODULES_ROOT)`) rather than a hardcoded literal, so adding a new module directory with a `model.ts` automatically raises the expectation.
- The header comment explicitly scopes out the "two authors" failure mode (hand-written migration vs. schema): by design `syncIndexes` is the sole index author, so no test simulates conflicting sources.
- The embedded-schema index leak (Mongoose copying a child schema's indexes onto the parent collection) is caught implicitly by the "EXACTLY what its schema declares" test—an embedded index appears as _stored but declared by nobody_.
- Duplicate-scan and unique-index-rejection cases write documents via the raw driver (bypassing Mongoose validation) to simulate pre-existing data that violates a unique constraint the schema still declares.
- `findBlockingDuplicates` is tested with an explicit scope (single collection) and without, to verify the scope argument actually limits the aggregation rather than being silently ignored.
