---
source: tests/unit/infrastructure/runtime/database.test.ts
sha256: 70fcea6152d9be29bff701f6e69a31d8a760692d109357ea0dccea68e69e1830
generated_at: 2026-11-08T10:23:31.929847+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/database.test.ts

## Purpose

Unit tests for `src/infrastructure/runtime/database.ts`, verifying which Mongo connection failures are retryable vs permanent, how the per-query time limit is configured (default, env override, job mode), the boot/connect lifecycle including `autoIndex` and command-monitoring setup, and that unexpected disconnects are logged while intentional shutdowns are not.

## Key elements

- **`isPermanentConnectError` tests** — Confirms `MongoParseError`, `MongoInvalidArgumentError`, and `MongoServerError` code 18 are permanent; `MongoServerSelectionError` is not.
- **Per-query time limit tests** — Asserts `configureMongoose` sets `mongoose.set('maxTimeMS', 5000)` by default, reads `NODE_MONGO_MAX_TIME_MS` when present, and that `start()` applies it before `connect`. `startJob()` uses the longer `JOB_MAX_TIME_MS` (asserted > 60 s).
- **`start` / boot tests** — Verifies that a permanent error rejects immediately (one `connect` attempt, message matching `/not retrying/`), that successful connect passes `monitorCommands: true` and calls `observeDatabaseCommands(mongoose.connection)`.
- **`autoIndex` sub-block** — `autoIndex` is set to `false` when `NODE_ENV` is `production` *or* unset; left untouched in `development`.
- **Connection-loss logging tests** — An unexpected `disconnected` event triggers `logger.warn('MongoDB connection lost.')`; the same event fired during `stopDatabase` does not.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — The module under test; imports `isPermanentConnectError`, `start`, `startJob`, `stopDatabase`, `configureMongoose`, and `JOB_MAX_TIME_MS`.
- **`src/infrastructure/persistence/command-metrics.ts`** — `observeDatabaseCommands` is factory-mocked (no real driver client exists because `mongoose.connect` is spied), then asserted to receive `mongoose.connection` after a successful `start()`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is spied on to assert the disconnect-logging contract.
- **`tests/support/environment.ts`** — `setEnvironment` and `withEnvironmentOverrides` are used to control `NODE_ENV` and `NODE_MONGO_MAX_TIME_MS` per test case.

## Notes

- `observeDatabaseCommands` is mocked at the module level precisely because `mongoose.connect` is spied in most tests, so there is no real driver client for the observer to attach to.
- The `autoIndex` assertions are made *inside* the mocked `connect` callback (i.e., at connect time) because that is the moment an index would actually be built. The comment notes this guard covers all cron processes (reaper, sweep), not only those booting through `createApp()`.
- `NODE_ENV: undefined` is intentionally treated the same as production for `autoIndex` — the test comment calls it "like any server."
- `JOB_MAX_TIME_MS` is imported and asserted to be `> 60_000`, coupling the test to the constant's magnitude.
