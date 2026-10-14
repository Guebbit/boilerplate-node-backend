---
source: src/infrastructure/runtime/database.ts
sha256: 8770f5f2d808ae6319dc90f179659ae40404b1d8e93bf4865ee1cb09f35a45ad
generated_at: 2026-10-14T08:13:21.323805+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/database.ts

## Purpose

Centralises the MongoDB connection lifecycle for the entire application: URI construction, connection with bounded exponential-backoff retry, Mongoose global configuration, connection-loss observability, clean shutdown, and a transaction helper. Every entry point (HTTP server, cron reapers, one-shot scripts) goes through this module rather than touching `mongoose.connect()` directly.

## Key elements

- **`COMMAND_MONITORING`** – `{ monitorCommands: true }` passed to `mongoose.connect()` so the driver emits command events consumed by `command-metrics`.
- **`isPermanentConnectError(error)`** – Returns `true` for `MongoParseError`, `MongoInvalidArgumentError`, or server code 18 (auth failure). These skip the retry budget and fail boot immediately.
- **`getDatabaseUri()`** – Resolves a connection string: full `NODE_DB_URI` if truthy, otherwise assembles `mongodb://host:port/name` from individual env vars. An *empty* `NODE_DB_URI` intentionally falls through (enables `npm run host` override).
- **`configureMongoose(maxTimeMs?)`** – Sets Mongoose global `autoIndex` (off in prod) and `maxTimeMS`; idempotent, safe to call more than once.
- **`start(maxTimeMs?)`** – Configures Mongoose, connects with up to 10 attempts (exponential backoff, 1 s → 30 s cap), starts command observation, and registers connection-loss watchers. Throws after budget or on permanent errors.
- **`startJob()`** – Thin wrapper over `start(JOB_MAX_TIME_MS)` (10 min) for scheduled/one-shot scripts that scan more than a request.
- **`stopDatabase()`** – Calls `mongoose.disconnect()`, logs-and-absorbs any rejection, resets the internal `stopping` flag.
- **`connection`** – Re-export of `mongoose.connection`; available at import time, populated after `start()` resolves. Used by readiness probes (`readyState`) and diagnostics.
- **`withTransaction<T>(work)`** – Runs `work(session)` inside a multi-document transaction via `connection.transaction`, with the driver's built-in transient-retry. Requires a replica set.
- **`JOB_MAX_TIME_MS`** (600 000 ms) – Per-query ceiling for background jobs; higher than the request-level `NODE_MONGO_MAX_TIME_MS`.

## Relationships

- **`scenarios/support/database-snapshot.ts`** – Explicitly *not* part of this module's concern; it handles empty/capture/restore for the demo profile and is imported only by its two test callers.
- **`scripts/db/bootstrap-access.ts`, `scripts/db/index-sync.ts`, `scripts/db/sync-indexes.ts`** – One-shot DB setup/sync scripts; call `startJob()` for their longer query limits. `sync-indexes.ts` is the designated place to create indexes in production (where `autoIndex` is off).
- **`scripts/ops/reap-*.ts`** (account-exports, delivery, inactive-accounts, invoice-pdfs, mail-spool, orders, orphaned-images, payments, previous-emails, quarantine, returns) – Scheduled reaper jobs; each calls `startJob()` so their scans get the 10-minute `maxTimeMS` ceiling and the same retry/watch/shutdown path as the server.
- **`@infrastructure/runtime/config`** – Provides `databaseConfig()` (URI fragments, `NODE_MONGO_MAX_TIME_MS`) and `isRelaxedEnvironment()` (gates `autoIndex`).
- **`@infrastructure/runtime/mongoose-defaults`** – `applyMongooseDefaults()` is invoked inside `configureMongoose` for callers that bypass the app entry.
- **`@infrastructure/persistence/command-metrics`** – `observeDatabaseCommands()` is called once the connection succeeds to start timing every command.

## Notes

- `mongoose` is a **singleton**: importing it anywhere in the process yields the same live connection object. There is no per-call handle to pass around.
- The retry loop is a **recursive promise chain**, not `async`/`await`, to match the codebase's explicit-promise-chain convention.
- `getDatabaseUri()` uses a **truthiness** check on `NODE_DB_URI` (not `!== undefined`). Blanking the variable to `""` is the supported way to fall through to host/port/name fragments; this is pinned by `tests/unit/scripts/db/host-scripts.test.ts`.
- `withTransaction` requires a **replica set**. A standalone `mongod` will reject `startTransaction()`. All environments (server, cron, `mongodb-memory-server` test double) run one.
- `maxTimeMS` applies only to **queries and aggregations** that did not set their own limit. Writes (`save`, `insertMany`, `bulkWrite`, raw `collection.*`) are unaffected; each write site carries a comment acknowledging this.
- `stopDatabase()` swallows disconnect rejections on purpose—the process is already exiting and a throw would abort remaining teardown steps.
- `watchConnection` is **idempotent** (guarded by `watching` flag), so calling `start()` more than once in a process is safe.
