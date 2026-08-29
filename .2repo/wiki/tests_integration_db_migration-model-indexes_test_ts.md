# tests/integration/db/migration-model-indexes.test.ts

## Purpose

Verifies that database migrations and Mongoose schema-declared indexes are compatible with each other. It is the only test in the suite that exercises a database where **both** migrations have been applied **and** the app has built its own indexes — the exact state a real deployment reaches. Without this, a name or option mismatch between a migration-created index and a schema-declared index would surface only as a boot failure in dev/staging/production.

## Key elements

- **`registeredModels`** — Walks `src/modules/*/model.ts` via synchronous `require` and imports each, triggering Mongoose registration. A new domain is covered automatically; a deleted one leaves cleanly.
- **`buildModelIndexes()`** — Calls `createIndexes()` on every registered model (re-issues the commands each call; avoids `init()`'s memoised promise).
- **`dropAllIndexes()`** — Drops all indexes (except the immutable `_id_`) from every collection so each test starts from a clean slate.
- **Test: "the app can build its indexes on an already-migrated database"** — Production ordering: migrations first, then boot.
- **Test: "the migrations can run against an already-booted database"** — Dev ordering: app indexes first, then a new migration lands.
- **Test: "neither half minds being run twice"** — Idempotency; catches name-mismatch errors that appear on the *second* run.
- **Test: "actually registered a model from every module that ships one"** — Canary: re-counts `model.ts` files on disk and asserts the registry matches, preventing a silent empty-walk pass.
- **Test: "leaves each collection holding exactly the indexes its schema declares"** — Bidirectional set comparison (stored ⊆ declared and declared ⊆ stored) by **key spec**, catching orphan migration indexes, missing schema indexes, and silent no-op drops.

## Relationships

- **`tests/support/database.ts`** — Supplies `connect` / `disconnect` used in `beforeAll` / `afterAll` to manage the `mongodb-memory-server` lifecycle.
- **`tests/support/migrations.ts`** — Supplies the `migrations` array (checked for non-emptiness), `nativeDb()` (used by `dropAllIndexes` to enumerate collections), and `runMigrations()` (executes the CommonJS migration scripts in order).

## Notes

- Indexes are compared **by key spec** (`JSON.stringify(key)`), not by name, so the assertion is robust to naming differences while still catching option conflicts (`unique`, `expireAfterSeconds`, partial filters) that surface as `IndexKeySpecsConflict`.
- The suite deliberately does **not** assert that every schema-declared index must also be created by a migration. Most collections rely on `autoIndex` alone; asserting a stricter policy would fail tests for a convention the codebase has not adopted.
- Uses synchronous `require` (with an eslint-disable) because ts-jest runs this file as CommonJS and the modules must be registered before Jest collects the suite.
- `dropAllIndexes` swallows errors (`.catch(() => {})`) because dropping an already-absent index is tolerated and not a failure.
