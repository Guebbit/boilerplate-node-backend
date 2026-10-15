---
source: tests/integration/persistence/strict-query.test.ts
sha256: d3312a550626d27f3a797b6381d01834b318ad219636bb9b3d6830979b5a2c3c
generated_at: 2026-10-15T12:50:43.996870+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/strict-query.test.ts

## Purpose

Integration test that confirms the `strictQuery: 'throw'` Mongoose option (set by `applyMongooseDefaults`) is active against a real database and actually causes queries filtering on undeclared schema paths to throw `StrictModeError` rather than silently matching all documents.

## Key elements

- **`probeModel`** — a locally defined Mongoose model (`StrictQueryProbe`) with a single declared path (`name: String`). Serves as the minimal schema used to exercise undeclared-path rejection.
- **`describe('strictQuery')`** — five assertions:
  - `strictQuery` is `'throw'` after suite bootstrap (i.e., `setupTestDb` has already called `applyMongooseDefaults`).
  - Calling `applyMongooseDefaults()` a second time is idempotent.
  - `find({ nope })` on the probe rejects with `{ name: 'StrictModeError' }`.
  - `find({ name })` on the probe still resolves (declared paths are unaffected).
  - `localeEntryModel.bulkWrite` with a filter containing an undeclared path (`nope`) also rejects with `StrictModeError`.

## Relationships

- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` at module top-level to open a real DB connection and apply runtime defaults before any test runs.
- **`src/infrastructure/runtime/mongoose-defaults.ts`** — exports `applyMongooseDefaults`, which sets `mongoose.set('strictQuery', 'throw')`. The test calls it directly (idempotency case) and relies on `setupTestDb` having invoked it.
- **`src/modules/locales/model.ts`** — exports `localeEntryModel`, used in the `bulkWrite` test to verify strict-query enforcement against a production model rather than only the local probe.

## Notes

- `setupTestDb()` is invoked at module scope (not inside `beforeAll`), so the DB connection and defaults are established as a side-effect of importing the test file.
- The first test ("is set to throw by the suite bootstrap") does **not** call `applyMongooseDefaults` itself; it asserts the state left by `setupTestDb`. The second test is the one that exercises the idempotency guarantee.
- The probe model is registered under the name `StrictQueryProbe`. If a test run already registered that name (e.g., via a re-import), Mongoose would throw on re-registration — keep the model name unique or ensure single import per process.
