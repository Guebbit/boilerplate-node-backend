---
source: src/infrastructure/runtime/database.ts
sha256: d8de365961c2ac881e8aee567130ef52f4c15e54c5412f74eeeb772b86dab2d3
generated_at: 2026-09-27T14:15:10.615519+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/database.ts

## Purpose

Centralises the MongoDB connection lifecycle — connecting with retry, watching for drops, and disconnecting on shutdown. Every entry point (the HTTP server, all cron/ops scripts, DB utility scripts) goes through this module so there is a single place that owns the Mongoose singleton, the retry policy, and the `autoIndex` guard.

## Key elements

- **`isPermanentConnectError(error)`** — Returns `true` when a `mongoose.connect()` rejection is one that retrying cannot fix (bad URI parse, invalid argument, auth code 18). Used to short-circuit the retry loop and fail fast.
- **`getDatabaseUri()`** — Builds the connection string. `NODE_DB_URI` wins if truthy; otherwise `NODE_MONGODB_HOST` / `PORT` / `NAME` are assembled (defaults: `127.0.0.1:27017/boilerplate-node-backend`).
- **`start()`** — Disables `autoIndex` in production, then connects with exponential backoff (1 s → 2 s → … capped at 30 s, 10 attempts). Attaches disconnect/reconnect watchers. Resolves once the handshake completes.
- **`stopDatabase()`** — Calls `mongoose.disconnect()`; logs and swallows any rejection so shutdown teardown is not aborted.
- **`connection`** — Re-export of the live `mongoose.connection` object. Available at import time; populated after `start()` resolves. Used by readiness probes and diagnostics.
- **`withTransaction<T>(work)`** — Delegates to `connection.transaction(work)`. `work` receives a `ClientSession` and must pass it to every write. Requires a replica set.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` instance used for retry warnings, disconnect/reconnect notices, and disconnect-failure logging.
- **`src/app.ts`** — The server's boot sequence calls `start()` and registers `stopDatabase()` in its shutdown chain.
- **`scripts/db/*` and `scripts/ops/*`** (bootstrap-access, grant-access, sync-indexes, reap-*, sweep-*) — Each script calls `start()` / `stopDatabase()` as its own entry-point lifecycle; they share the same retry and `autoIndex` guard without needing `createApp()`.

## Notes

- The truthiness check on `NODE_DB_URI` (not `!== undefined`) is intentional: an *empty* string falls through to host/port fragments, which is how the `host` npm script reaches a containerised Mongo from the host while keeping the database name in `.env`. Pinned by `tests/unit/scripts/db/host-scripts.test.ts`.
- `start()` uses a recursive promise chain rather than `async`/`await` to match the codebase's explicit-promise style.
- `withTransaction` requires a replica set; a standalone `mongod` rejects `startTransaction()` outright. The test environment (`mongodb-memory-server`) and `docker-compose.yml` both run a single-node replica set to satisfy this.
- `autoIndex` is never turned *on* by this module. Dev/test rely on Mongoose's default (on); production relies on `scripts/db/sync-indexes.ts` having already run with it off.
