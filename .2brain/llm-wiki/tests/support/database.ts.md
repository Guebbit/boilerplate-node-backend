---
source: tests/support/database.ts
sha256: e9ca077638e4ea2b38ca3451ec52f6d14e2e80b2c22a55a0f0dbbe658c694660
generated_at: 2026-10-15T12:57:41.235315+00:00
model: ollama:qwen3.8:27b
---

# tests/support/database.ts

## Purpose

Provides per-file database connection helpers for the test suite. Each test file gets its own **database** on a single shared in-memory MongoDB instance (started once in `globalSetup`), avoiding the cost of spawning a `mongod` per file — a problem that previously stranded 88 GB of disk under mutation testing.

## Key elements

- **`connect()`** — Reads `NODE_TEST_MONGO_URI` from the environment, applies shared Mongoose configuration, connects with a unique `dbName` (`test-` + 8-char UUID slice), hooks command metrics, then awaits `Model.init()` for every registered model so all indexes exist before the first test runs.
- **`disconnect()`** — Drops the file's database and closes the Mongoose connection; the shared server stays alive for subsequent files.
- **`clearAll()`** — Empties every collection in the current database via `deleteMany({})` without dropping the database or closing the connection.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Imports `configureMongoose` and `COMMAND_MONITORING` so tests use the same Mongoose settings as production processes.
- **`src/infrastructure/persistence/command-metrics.ts`** — Imports and calls `observeDatabaseCommands(mongoose.connection)` to instrument database commands in tests.
- **`tests/support/setup-test-db.ts`** — The caller that invokes `connect()` / `disconnect()` from `beforeAll` / `afterAll` in each test file.
- **`tests/integration/scenarios/shop.test.ts`**, **`tests/integration/scripts/db/index-sync.test.ts`** — Consumers that rely on the isolation guarantees (per-file database, `clearAll` between cases).

## Notes

- Must be run **through jest** (wired via `globalSetup` in `jest.config.js`). Importing the module directly will throw because `NODE_TEST_MONGO_URI` will be unset.
- The `Model.init()` await in `connect()` is load-bearing: without it, unique-index enforcement races the first insert, causing intermittent failures only under parallel workers.
- `clearAll` clears collections in-place; it does **not** drop the database. Use `disconnect` for full teardown.
- `process.env` is the intentional channel for the shared URI — jest gives each test file a fresh module registry, so a module-level singleton would not survive the boundary.
