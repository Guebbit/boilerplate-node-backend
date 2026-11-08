---
source: tests/support/database.ts
sha256: e9ca077638e4ea2b38ca3451ec52f6d14e2e80b2c22a55a0f0dbbe658c694660
generated_at: 2026-11-08T09:53:49.758540+00:00
model: ollama:qwen3.8:27b
---

# tests/support/database.ts

## Purpose

Provides the per-file database lifecycle (connect, disconnect, clearAll) for test suites. Each test file connects to a single shared in-memory Mongo (started once by `globalSetup`) and gets its own isolated database, avoiding the cost of spawning a `mongod` per file.

## Key elements

- **`connect()`** — Reads `NODE_TEST_MONGO_URI` from the environment, applies shared Mongoose config (`configureMongoose`) and command monitoring, connects with a per-file `dbName` (8-char random UUID), hooks `observeDatabaseCommands`, and awaits `Model.init()` on every registered model so all indexes are built before the first test runs.
- **`disconnect()`** — Drops the file's database and closes the Mongoose connection; the shared server keeps running for subsequent files.
- **`clearAll()`** — Deletes all documents in every collection without dropping the database or closing the connection. Used between individual test cases.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Imports `COMMAND_MONITORING` and `configureMongoose` so tests use the same Mongoose settings as production code.
- **`src/infrastructure/persistence/command-metrics.ts`** — Imports `observeDatabaseCommands` to wire command-level metrics onto the test connection.
- **`tests/support/setup-test-db.ts`** — The higher-level setup that calls `connect` / `disconnect` / `clearAll` from this module in `beforeAll` / `afterAll` / `beforeEach` hooks.
- **`tests/integration/scenarios/shop.test.ts`** — A consumer suite that relies on `clearAll` for per-case isolation and on the index-wait in `connect` for unique-index assertions.
- **`tests/integration/scripts/db/index-sync.test.ts`** — A consumer that depends on indexes being fully built before its first assertion runs.

## Notes

- **`NODE_TEST_MONGO_URI` is required.** If unset, `connect` throws. The variable is published by `tests/support/global-setup.ts` (wired via `globalSetup` in `jest.config.js`). Importing this module outside of Jest will fail.
- **Index race.** Mongoose builds indexes in the background; `connect()` resolving does not guarantee a unique index is active. The `Promise.all(model.init())` wait exists specifically to prevent intermittent duplicate-insert passes under parallel workers. Removing it will surface flaky unique-index tests.
- **Isolation model.** One database per file (random name), `clearAll` between cases, `disconnect` drops the database on exit. The server itself is never torn down here.
- **Disk cost warning.** The docblock notes that a per-file `MongoMemoryServer` previously stranded ~88 GB across 212 `dbpath` directories in a single Stryker run. The shared-server pattern here prevents that; do not reintroduce per-file server spawning.
