---
source: tests/support/database.ts
sha256: 5be3443423f671801cfa7d7390f03c0074678f6165be0b1f8df5f28340cd5ed0
generated_at: 2026-09-23T20:10:27.754871+00:00
model: ollama:qwen3.8:27b
---

# tests/support/database.ts

## Purpose

Provides per-file database connection lifecycle (connect, disconnect, clear) for the test suite. It connects to a single shared in-memory MongoDB started by `globalSetup`, assigning each test file a uniquely named database to preserve isolation while bounding disk and process costs (one server for all files instead of one per file).

## Key elements

- **`connect()`** – Reads `NODE_TEST_MONGO_URI` from the environment, calls `mongoose.connect` with a unique `dbName` (`test-<8-char uuid>`), then awaits `Model.init()` on every registered model to guarantee all indexes (including unique indexes) are built before the first test case runs.
- **`disconnect()`** – Drops the current file's database and closes the Mongoose connection. The shared `mongod` process remains running for subsequent files.
- **`clearAll()`** – Iterates `mongoose.connection.collections` and calls `deleteMany({})` on each, emptying all data without dropping the database or closing the connection.

## Relationships

- **`tests/support/setup-test-db.ts`** – Direct consumer. Calls `connect()` in `beforeAll`, `clearAll()` in `beforeEach`, and `disconnect()` in `afterAll` to manage the per-file lifecycle for any test file that imports it.
- **`tests/integration/scenarios/shop.test.ts`** – Integration test suite that relies on the database state managed through `setup-test-db.ts`.
- **`tests/integration/scripts/db/index-sync.test.ts`** – Integration test that exercises index synchronization; benefits from the `Model.init()` wait in `connect()` ensuring indexes exist before assertions.

## Notes

- **Requires `NODE_TEST_MONGO_URI`** – If unset, `connect()` throws with a pointer to `global-setup.ts`. Tests must run through Jest (which wires `globalSetup` in `jest.config.js`), not by importing this module standalone.
- **Index race guard** – The `Promise.all(…model.init())` wait is deliberate. Without it, unique-index enforcement tests can pass or fail intermittently under parallel workers because Mongoose builds indexes asynchronously after `connect()` resolves.
- **Per-file isolation model** – Isolation is achieved by unique database name + `clearAll` between cases + `disconnect` dropping the DB. The shared server is the only deviation from a per-file `MongoMemoryServer`; it cuts disk and process overhead without changing data separation.
- **`disconnect` does not stop the server** – The `mongod` process is owned by `globalSetup`/`globalTeardown`; this file only manages the client-side connection and its named database.
