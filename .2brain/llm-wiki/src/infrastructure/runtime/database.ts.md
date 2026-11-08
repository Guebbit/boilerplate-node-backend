---
source: src/infrastructure/runtime/database.ts
sha256: 8b3c31fa2d2538e3528ce003c31ca77219d3335426091b9a078ecd8908a2e5fe
generated_at: 2026-11-08T03:46:38.949175+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/database.ts

## Purpose

Manages the full MongoDB connection lifecycle for the process: URI resolution, Mongoose global configuration, connect-with-retry, connection-drop logging, clean disconnect, and multi-document transactions. Every entry point (server, cron scripts, one-shot ops) funnels through this file so that retry, monitoring, and time-limit policy are set in exactly one place.

## Key elements

- **`COMMAND_MONITORING`** – `as const` option object that enables the driver's `commandStarted`/`Succeeded`/`Failed` events, consumed by `command-metrics.ts`.
- **`isPermanentConnectError(error)`** – Returns `true` for parse errors, invalid-argument errors, or auth-failed (code 18), signalling that retry is pointless.
- **`JOB_MAX_TIME_MS`** – `10 × MINUTE_MS`; the per-query ceiling passed to `startJob` for long-running sweeps/reapers.
- **`getDatabaseUri()`** – Resolves the Mongo URI from `databaseConfig()`: a non-empty `NODE_DB_URI` wins; otherwise `mongodb://host:port/db` is assembled from fragments.
- **`configureMongoose(maxTimeMs?)`** – Sets Mongoose globals (`autoIndex` off in prod, `maxTimeMS` for queries) and applies `mongoose-defaults`. Idempotent.
- **`start(maxTimeMs?)`** – Configures Mongoose, then connects with recursive exponential-backoff retry (1 s → 30 s cap, 10 attempts). Wires command monitoring on success. Throws immediately on a permanent error. Attaches disconnect/reconnect logging.
- **`startJob()`** – Thin wrapper: `start(JOB_MAX_TIME_MS)` for scheduled jobs.
- **`stopDatabase()`** – Calls `mongoose.disconnect()`, absorbs and logs any rejection so the shutdown chain is not aborted.
- **`connection`** – Destructured re-export of `mongoose.connection`; safe to read before `start()` resolves (the object exists at import time, populated later). Used by readiness probes.
- **`withTransaction(work)`** – Runs `work(session)` inside a MongoDB multi-document transaction via `connection.transaction`, retrying on transient errors per the driver's recommended pattern. Requires a replica set.

## Relationships

- **`@infrastructure/runtime/config`** – Source of `databaseConfig()` (URI, host, port, name, `NODE_MONGO_MAX_TIME_MS`) and `isRelaxedEnvironment()`.
- **`@infrastructure/runtime/mongoose-defaults`** – `applyMongooseDefaults()` is called inside `configureMongoose` for a caller that skips the app entry.
- **`@infrastructure/persistence/command-metrics`** – `observeDatabaseCommands` is invoked once the connection succeeds, subscribing to the driver's command events.
- **`@domain-primitives/time`** – Supplies `MINUTE_MS` used to compute `JOB_MAX_TIME_MS`.
- **`@infrastructure/adapters/logger`** – `logger.warn` / `logger.info` for retry, disconnect, reconnect, and disconnect-failure messages.
- **`scripts/db/sync-indexes.ts`** – Explicitly referenced: it is the production path that ensures indexes exist before `autoIndex` is turned off here.
- **`scenarios/support/database-snapshot.ts`** – Deliberately a *separate* concern (demo-profile capture/restore); not imported here.
- **`src/app.ts`, cron/job scripts** – Primary consumers of `start`, `startJob`, `stopDatabase`, and `withTransaction`.

## Notes

- The `NODE_DB_URI` check is a **truthiness** test, not `!== undefined`. An empty string intentionally falls through to host/port fragments so the `host` npm script can blank the URI and override only the host. This is pinned by `tests/unit/scripts/db/host-scripts.test.ts`.
- Mongoose is a **process-wide singleton**: `mongoose.connect()` mutates global state. There is no per-instance isolation; the first successful connect in the process is the one every schema sees.
- `mongoose.set('maxTimeMS', …)` applies only to **queries and aggregates** that did not set their own limit. Writes (`save`, `insertMany`, `bulkWrite`, raw `collection.*`) are unaffected and must set a limit by hand.
- `autoIndex` is **never turned on** by this file. Production turns it off; dev/test rely on Mongoose's default (on).
- The retry loop is a **recursive promise chain**, not `async`/`await` — a codebase-wide convention.
- `withTransaction` will throw on a standalone `mongod`; every deployment (prod, docker-compose, `mongodb-memory-server` in tests) uses a single-node replica set.
- `watchConnection` is idempotent (`watching` flag); `stopDatabase` sets `stopping` so its own `disconnected` event is not logged as an outage.
