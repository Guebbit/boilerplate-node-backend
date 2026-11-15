---
source: src/infrastructure/runtime/database.ts
sha256: 76d686565c39776bd57b8400e3cd5e647620f2e62c7ae5ce93af8f10893e0940
generated_at: 2026-11-14T18:16:24.908627+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/database.ts

## Purpose

Single ownership of the MongoDB connection lifecycle: URI resolution, Mongoose global configuration, connect-with-retry, disconnect, connection-health logging, and a transaction wrapper. Every entry point (server, cron scripts, one-shot ops) goes through `start` or `startJob` here rather than calling `mongoose.connect()` directly.

## Key elements

- **`COMMAND_MONITORING`** – connect option (`monitorCommands: true`) that makes the driver emit command events consumed by `command-metrics.ts`.
- **`isPermanentConnectError`** – returns `true` for unparseable URIs, invalid arguments, or auth failure (code 18) so the boot aborts immediately instead of burning the full retry budget.
- **`JOB_MAX_TIME_MS`** – 10-minute per-query ceiling for scheduled jobs (reapers, sweeps), longer than the request-path limit.
- **`getDatabaseUri`** – resolves the connection string: full `NODE_DB_URI` wins; otherwise assembles from `NODE_MONGODB_HOST`/`NODE_MONGODB_PORT`/`NODE_MONGODB_NAME` fragments.
- **`configureMongoose`** – sets Mongoose global options (`autoIndex` off in production, `maxTimeMS`) before any query runs. Idempotent.
- **`start(maxTimeMs?)`** – connects with exponential backoff (1 s → 30 s cap, max 10 attempts), calls `configureMongoose`, starts command observation, attaches disconnect/reconnect listeners.
- **`startJob()`** – convenience alias: `start(JOB_MAX_TIME_MS)`.
- **`watchConnection`** – logs `disconnected` / `reconnected` events so an in-flight Mongo outage is visible in logs.
- **`stopDatabase`** – calls `mongoose.disconnect()`, absorbs rejections (process is already exiting), resets the internal `stopping` flag.
- **`connection`** – re-export of `mongoose.connection`; the object exists at import time so readiness probes can read its `readyState` before `start()` resolves.
- **`withTransaction(work)`** – wraps `work(session)` in a MongoDB multi-document transaction (delegates to `connection.transaction`), which retries the whole body up to 120 s on transient errors.

## Relationships

- **`src/infrastructure/runtime/config.ts`** – reads `databaseConfig()` (URI fragments, `NODE_MONGO_MAX_TIME_MS`) and `isRelaxedEnvironment()` (gates `autoIndex`).
- **`src/infrastructure/runtime/mongoose-defaults.ts`** – calls `applyMongooseDefaults()` inside `configureMongoose` to establish baseline Mongoose settings first.
- **`src/infrastructure/persistence/command-metrics.ts`** – on successful connect, `observeDatabaseCommands()` is invoked to start timing every command the driver emits.
- **`src/infrastructure/adapters/logger.ts`** – all retry warnings, disconnect/reconnect notices, and disconnect-failure logs go through this shared logger.
- **`src/domain-primitives/time.ts`** – provides `MINUTE_MS` used to define `JOB_MAX_TIME_MS`.
- **`src/infrastructure/runtime/readiness.ts`** – reads the exported `connection` object to answer health/readiness probes.
- **`scripts/ops/run-job.ts`** – scheduled-job entry point; calls `startJob()` to get the longer query limit.
- **`scripts/db/sync-indexes.ts` / `scripts/db/index-sync.ts`** – explicitly mentioned in the `start` doc as having run with `autoIndex: false` in production; this file never turns `autoIndex` back on.
- **`scenarios/support/database-snapshot.ts`** – the module doc calls this out as a *separate* concern (snapshot capture/restore for the demo profile); this file does not interact with it.
- **`src/app.ts`** – the application boot path calls `start()` (and potentially `configureMongoose` redundantly); this file is the shared guard for all entry points.

## Notes

- **Truthiness, not `!== undefined`, in `getDatabaseUri`.** An empty `NODE_DB_URI` deliberately falls through to the host/port/name fragments. This is how `npm run host` blanks the URI and overrides only the host while keeping the database name from `.env`. Pinned by `tests/unit/scripts/db/host-scripts.test.ts`.
- **Mongoose is a process-wide singleton.** `import mongoose` anywhere yields the same connection object; `mongoose.connect()` mutates global state. No file needs to pass the handle around.
- **Retry uses recursive promise chains, not `async/await`.** A codebase-wide convention; each retry chains onto the previous `.then()` to stay on the event loop (a `setTimeout`-based sleep yields to the loop so the health-check endpoint keeps answering).
- **`autoIndex` is only ever turned *off* here** (production). Dev/test rely on Mongoose's own default (on) to get index constraints for free. Never set to `true` explicitly.
- **`withTransaction` requires a replica set.** A standalone `mongod` rejects `startTransaction()`. All environments (ephemeral test mongod, docker-compose) run one.
- **Side-effect rule for transactions:** only writes and outbox rows go inside `work`. External calls (provider APIs, mail, cache) must run *after* the transaction resolves, because a retried/aborted transaction re-runs the entire body.
- **`stopping` flag** prevents the `disconnected` listener from logging a spurious "connection lost" during the intentional `stopDatabase` shutdown.
