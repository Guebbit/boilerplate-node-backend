---
source: src/infrastructure/runtime/database.ts
source_sha256: a023059ba571a4c8b11e027a5b39bc4565c00678370896970333336a6f688cea
context_sha256: b632f300c7fde4289fd543f3339617be78fd8209661c95ef531855b0e2a5e192
generated_at: 2026-11-22T03:06:12.962091+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/database.ts

## Purpose
Owns the MongoDB connection lifecycle for the process: configuring Mongoose globals, connecting with retry/backoff, watching connection events, shutting down, and running multi-document transactions. Demo-profile snapshot logic is deliberately elsewhere (`scenarios/support/database-snapshot.ts`).

## Key elements
- `COMMAND_MONITORING` – connect option `{ monitorCommands: true }` so the driver emits command events that `command-metrics.ts` times.
- `isPermanentConnectError(error)` – true for `MongoParseError`, `MongoInvalidArgumentError`, or server error code 18 (authentication failed); these skip retries.
- `JOB_MAX_TIME_MS` – per-query server time limit for scheduled jobs (10 minutes, via `MINUTE_MS`).
- `getDatabaseUri()` – returns `NODE_DB_URI` if truthy, otherwise builds `mongodb://host:port/name` from the `NODE_MONGODB_*` fragments.
- `configureMongoose(maxTimeMs?)` – calls `applyMongooseDefaults()`, sets `autoIndex=false` unless the environment is relaxed, and sets the global `maxTimeMS` (defaults to `NODE_MONGO_MAX_TIME_MS`).
- `start(maxTimeMs?)` – configures Mongoose, attaches connection watchers, and connects with exponential backoff (1s base, doubling, capped at 30s, max 10 attempts). On success it starts `observeDatabaseCommands(mongoose.connection)`. Throws on permanent errors or when attempts run out.
- `startJob()` – `start(JOB_MAX_TIME_MS)` for reapers, sweeps and one-shot scripts.
- `stopDatabase()` – `mongoose.disconnect()`. Rejections are logged and absorbed, and a `stopping` flag suppresses the "connection lost" warning.
- `connection` – re-export of `mongoose.connection`, for readiness probes and diagnostics.
- A transaction helper follows `connection` (its description is in the doc comment above it). It runs `work` with a session inside a multi-document transaction, and retries the whole callback on transient driver errors for up to 120 s. It requires a replica set.

## Relationships
- **Config**: reads `databaseConfig()` and `isRelaxedEnvironment()` from `src/infrastructure/runtime/config.ts`.
- **Mongoose defaults**: `src/infrastructure/runtime/mongoose-defaults.ts` supplies `applyMongooseDefaults()`, which `configureMongoose` repeats for callers that skip the entry point.
- **Metrics**: `src/infrastructure/persistence/command-metrics.ts` receives the connection after a successful connect.
- **Logging**: warnings and info go through `src/infrastructure/adapters/logger.ts`.
- **Time**: `MINUTE_MS` comes from `src/domain-primitives/time.ts`.
- **Entry points / scripts**: the neighbors `src/app/process-boot.ts`, `scripts/db/*` and `scripts/ops/*` (`run-job.ts`, `reencrypt.ts`, `reapply-erasures.ts`) fit the connect and shutdown roles. The excerpt doesn't show their exact calls.
- **Readiness**: `src/infrastructure/runtime/readiness.ts` is a probable consumer of the exported `connection` (`readyState`).
- **Scenarios**: `scenarios/support/database-snapshot.ts` is the separate snapshot concern. The excerpt does not show `scenarios/support/doubles/payments/levers.ts`.

## Notes
- The truthiness check in `getDatabaseUri` is deliberate. An empty `NODE_DB_URI` falls through to the host/port/name fragments, which `npm run host` relies on.
- `maxTimeMS` is a global Mongoose option. It applies to find, count, distinct, aggregate and `findOneAndX` queries that don't set their own, and an explicit value (even `0`) is kept. It does not apply to writes (`save`, `insertMany`, `bulkWrite`, `updateOne`/`updateMany`/`deleteMany`) or raw `collection.*` calls.
- A killed query surfaces as 503 `QUERY_TIMEOUT`.
- `autoIndex` is only ever turned off (in non-relaxed environments), never on. Dev and test keep Mongoose's default.
- The retry loop uses explicit promise chains rather than `async`/`await`, and waits with the non-blocking `timers/promises` `setTimeout`.
- `watchConnection()` is guarded by a `watching` flag, so calling `start()` again does not duplicate listeners.
- Inside a transaction callback, only session writes and outbox rows are safe. Side effects such as provider calls, mail or cache writes belong after the transaction resolves, because retries re-run `work`.
- Several `logger` calls are wrapped in `// Stryker disable all` / `restore all` for mutation testing.
