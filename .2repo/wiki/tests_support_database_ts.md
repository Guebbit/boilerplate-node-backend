# tests/support/database.ts

## Purpose

Provides the three-lifecycle test-database helpers (`connect`, `disconnect`, `clearAll`) that every DB-touching integration test uses. It connects Mongoose to a **shared** in-memory Mongo started once by `globalSetup`, allocating a unique database name per test file to preserve isolation without spawning a `mongod` per file.

## Key elements

- **`connect()`** — Reads `NODE_TEST_MONGO_URI` from `process.env` (set by `globalSetup`), connects Mongoose with `dbName: `test-${randomUUID().slice(0, 8)}``, then awaits `Model.init()` for every registered model so all indexes are fully built before the first test case runs. Throws a descriptive error if the env var is missing.
- **`disconnect()`** — Drops the file's database (`dropDatabase()`) and closes the Mongoose connection. The shared server itself is left running for subsequent files.
- **`clearAll()`** — Iterates every collection in the current Mongoose connection and runs `deleteMany({})`, emptying all data between test cases.

## Relationships

- **`tests/support/setup-test-db.ts`** — Starts the single `MongoMemoryServer` during `globalSetup` and publishes its URI into `process.env.NODE_TEST_MONGO_URI`. This file is the consumer of that URI; the two together replace the old "one server per file" pattern.
- **`tests/integration/db/migration-demo-data.test.ts`** and **`tests/integration/db/migration-model-indexes.test.ts`** — Import `connect` / `disconnect` / `clearAll` in their `beforeAll` / `afterAll` / `beforeEach` hooks to manage their per-file database lifecycle.

## Notes

- **Index race is real and guarded.** Connecting to an already-running server resolves immediately (no natural startup delay), so `connect()` explicitly awaits `Model.init()` for every registered model. Skipping this wait reintroduces intermittent unique-index violations under parallel workers.
- **Isolation model.** Files are isolated by *database name*, not by separate server instances. `clearAll` handles within-file isolation; `disconnect` drops the database on teardown.
- **`clearAll` scope.** It clears every collection in the *current* Mongoose connection (i.e., this file's database). It does not touch other files' databases.
- **Do not call `connect()` outside Jest.** It will throw if `NODE_TEST_MONGO_URI` is unset, because it expects the `globalSetup` → `global-teardown` lifecycle managed by `jest.config.js`.
