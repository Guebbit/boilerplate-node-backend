---
source: tests/integration/persistence/strict-query.test.ts
sha256: d3312a550626d27f3a797b6381d01834b318ad219636bb9b3d6830979b5a2c3c
generated_at: 2026-11-08T09:45:26.161975+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/strict-query.test.ts

## Purpose

Integration test (real database) that verifies `strictQuery: 'throw'` is applied by the suite bootstrap and actually rejects queries or bulk-writes that reference a schema path the model does not declare. It guards against the silent "match everything" failure mode a typo like `{ emial }` would otherwise cause.

## Key elements

- **`probeModel`** – Minimal schema (`name: String`) used as a controlled target; `nope` is the intentionally undeclared path for negative assertions.
- **"is set to throw by the suite bootstrap"** – Asserts `mongoose.get('strictQuery') === 'throw'` after global setup.
- **"is idempotent"** – Calls `applyMongooseDefaults()` a second time and re-asserts the value, ensuring repeated invocation is safe.
- **"refuses a find on an undeclared path"** – `find({ nope: 'a' })` rejects with a `StrictModeError`.
- **"still accepts a declared path"** – `find({ name: 'a' })` resolves normally.
- **"refuses a locales bulkWrite…"** – Confirms the setting also guards `bulkWrite` filters on a production model (`localeEntryModel`).

## Relationships

- **`src/infrastructure/runtime/mongoose-defaults.ts`** – Source of `applyMongooseDefaults`, the function under test that sets `mongoose.set('strictQuery', 'throw')`.
- **`src/modules/locales/model.ts`** – Provides `localeEntryModel`, a real application model used to verify the strict-query rule applies to production schemas and write paths, not just the probe.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is invoked at module top-level to open a real MongoDB connection before any assertion runs.

## Notes

- `setupTestDb()` is called at file scope (not inside `beforeAll`), so the connection is established before the `describe` block registers.
- The `localeEntryModel` bulkWrite test has no preceding `create`; it relies solely on the filter check, which is sufficient because strictQuery rejects the query before the DB is reached.
- The probe model is registered with a fixed name (`'StrictQueryProbe'`); if a test runner loads this file more than once in the same process, a duplicate-model error will result.
