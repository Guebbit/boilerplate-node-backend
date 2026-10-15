---
source: tests/unit/infrastructure/runtime/database.test.ts
sha256: ceceb8d0280e0e29989b00944794fc79b052b3d44e8a4cb27c6d817f2ddfee5c
generated_at: 2026-10-15T13:19:17.932402+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/database.test.ts

## Purpose

Unit tests for `src/infrastructure/runtime/database.ts`. They verify which MongoDB connection errors are classified as permanent (no retry) versus transient, how per-query time limits are applied via Mongoose globals, the startup sequence (autoIndex suppression, command-monitoring setup), and that unexpected disconnections produce a warning while an intentional `stopDatabase` shutdown does not.

## Key elements

- **`describe('isPermanentConnectError')`** — Table-driven assertions that `MongoParseError`, `MongoInvalidArgumentError`, and auth-refusal (`code: 18`) return `true`, while `MongoServerSelectionError` returns `false` (retry).
- **`describe('the per-query time limit')`** — Confirms `configureMongoose()` sets `maxTimeMS` to 5 000 by default, honours `NODE_MONGO_MAX_TIME_MS`, that `start()` applies the limit *before* calling `mongoose.connect`, and that `startJob()` uses the longer `JOB_MAX_TIME_MS` (asserted > 60 s).
- **`describe('start')`** — Verifies that a permanent error causes `start()` to reject immediately with a "not retrying" message; that a successful connect enables `monitorCommands: true` and calls `observeDatabaseCommands(mongoose.connection)`.
  - **`describe('autoIndex')`** — Asserts `autoIndex` is set to `false` in production and when `NODE_ENV` is unset, but left untouched in development.
- **`describe('connection loss logging')`** — Emits a `disconnected` event and confirms `logger.warn` fires; then runs `stopDatabase()` under a mocked `disconnect` and confirms no warning is emitted.
- **Module-level `jest.mock`** — Stubs `observeDatabaseCommands` as a no-op `jest.fn()` because the mocked `mongoose.connect` never yields a real driver client.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — The system under test. Exports imported here: `configureMongoose`, `isPermanentConnectError`, `start`, `startJob`, `stopDatabase`, `JOB_MAX_TIME_MS`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is spied on to assert (or refute) connection-loss logging.
- **`src/infrastructure/persistence/command-metrics.ts`** — Fully mocked at module level; the spy on `observeDatabaseCommands` verifies it is wired to `mongoose.connection` after a successful connect.
- **`tests/support/environment.ts`** — Provides `setEnvironment` / `withoutEnvironment` helpers used to set or clear `NODE_ENV` and `NODE_MONGO_MAX_TIME_MS` around individual test cases.

## Notes

- `mongoose` is imported directly (not mocked at the module level) so tests can `jest.spyOn` its `set`, `connect`, and `disconnect` methods. The `connect` spy is restored in each test that needs it.
- The autoIndex guard is asserted *at connect time* (inside the `mockImplementation` of `connect`) rather than before the call, because that is the moment an index would actually be built.
- `JOB_MAX_TIME_MS` is only asserted to be greater than 60 000 ms; its exact value is an implementation detail.
- The file relies on `jest.restoreAllMocks()` in `afterEach` for the time-limit and connection-loss suites, but individual `start` tests manually call `.mockRestore()` to avoid leakage into sibling tests.
