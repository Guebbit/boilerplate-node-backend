---
source: scenarios/support/ephemeral-mongod.ts
sha256: a7cb49490c8e9c6a468116c2a6ea1b41b08d07f65a93c88414039b4630e4fd8e
generated_at: 2026-10-01T12:24:11.405128+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/ephemeral-mongod.ts

## Purpose

Starts a real, single-member `mongod` replica set in-process via `mongodb-memory-server`. It lives in `scenarios/` rather than `src/` because `mongodb-memory-server` is a devDependency and the `not-to-dev-dep` lint rule forbids `src/` from importing one. It provides the concrete "start" half of the `EphemeralMongo` contract defined in `./ephemeral-mongo.ts`.

## Key elements

- **`startInProcessMongod(databasePath?: string)`** — Exported. Creates a `MongoMemoryReplSet` (count 1, WiredTiger) and races it against a 120 s timeout. On success returns a Promise resolving to an `EphemeralMongo` object; on failure logs the error and calls `process.exit(1)`.
- **`toEphemeralMongo(server: MongoMemoryReplSet)`** — Private adapter that maps the library's `getUri()` / `stop()` surface onto the `EphemeralMongo` type.
- **`CREATE_SERVER_TIMEOUT_MS`** — 120 000 ms. Guards against an infinite wait caused by `mongodb-memory-server`'s stale, machine-wide binary-download lock under `~/.cache/mongodb-binaries`.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — This file imports the `EphemeralMongo` type from it; it is the consumer of the contract defined there.
- **`src/infrastructure/adapters/logger.ts`** — Imported (as a relative path) to log startup failures.
- **`scenarios/run-server.ts`**, **`tests/support/global-setup.ts`**, **`tests/cluster/support/cluster.ts`** — All three call `startInProcessMongod` rather than each shipping their own copy; `tests/` is permitted to import from `scenarios/`.

## Notes

- **Relative import of `logger`**: The file imports `../../src/infrastructure/adapters/logger` rather than the `@infrastructure` alias. `tests/support/global-setup.ts` is loaded by Jest *outside* its normal `moduleNameMapper` resolution, so the alias would type-check but fail at runtime.
- **Replica set, not standalone**: A single-member replica set is used (not a plain `mongod`) because multi-document transactions (`startTransaction()`) are rejected by a standalone instance. `count: 1` keeps overhead negligible.
- **`storageEngine: 'wiredTiger'` is explicit**: Transactions require it, and `mongodb-memory-server`'s default only follows the mongod version's own default, which may not guarantee it.
- **Timeout semantics**: The 120 s limit is specifically for a *stalled* lock (a reused PID in the lock file after an OOM/SIGKILL), not for a slow first-time binary download. The error message directs the operator to delete the stale lock file.
