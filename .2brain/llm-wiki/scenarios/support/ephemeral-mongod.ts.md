---
source: scenarios/support/ephemeral-mongod.ts
sha256: d25ceb3480f23a38f1aa13099c6ce61ec4592f4fe9f1c5d09c1052791b0e4c94
generated_at: 2026-09-27T13:51:29.853169+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/ephemeral-mongod.ts

## Purpose

Starts an in-process, single-member `mongod` replica set via `mongodb-memory-server` and adapts it to the `EphemeralMongo` interface. It lives outside `src/` because `mongodb-memory-server` is a devDependency and the `not-to-dev-dep` rule forbids `src/` from importing it. It is the concrete "start a real mongod" half of the `startEphemeralMongo` contract defined in `./ephemeral-mongo.ts`.

## Key elements

- **`startInProcessMongod(databasePath?)`** — the sole export. Creates a `MongoMemoryReplSet` (count 1, wiredTiger) and returns a `Promise<EphemeralMongo>`. Races creation against a 120 s timeout; on failure logs via `logger.error` and calls `process.exit(1)`.
- **`toEphemeralMongo(server)`** — private adapter that maps a `MongoMemoryReplSet` handle onto the `EphemeralMongo` shape (`{ uri, stop }`).
- **`CREATE_SERVER_TIMEOUT_MS`** — 120 000 ms guard against a silent hang caused by a stale `~/.cache/mongodb-binaries` lock file in `mongodb-memory-server`.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — defines the `EphemeralMongo` type that this file implements; this file is its "real mongod" strategy.
- **`scenarios/run-server.ts`** — calls `startInProcessMongod` to bring up a local database for scenario execution.
- **`tests/support/global-setup.ts`** — calls `startInProcessMongod` before the test run; this file's relative (non-alias) import of `logger` exists specifically because Jest loads this file outside the normal `moduleNameMapper` scope.
- **`tests/cluster/support/cluster.ts`** — calls `startInProcessMongod` for cluster-test fixtures.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` used to report start failures. Imported via relative path (`../../src/…`), not the `@infrastructure` alias.

## Notes

- A **replica set** is used instead of a standalone `mongod` because multi-document transactions (`startTransaction`) are rejected by a standalone instance. `count: 1` keeps overhead negligible.
- `storageEngine: 'wiredTiger'` is set explicitly; transactions require it and the library's implicit default only follows the mongod binary version.
- The relative import of `logger` is intentional and load-bearing: Jest's `globalSetup` path does not apply `moduleNameMapper`, so the `@infrastructure` alias would pass `tsc`/`eslint` but crash at runtime.
- On any start failure the process exits immediately (`process.exit(1)`)—there is no retry or fallback path.
- The 120 s timeout message directs the operator to delete a stale lock file under `~/.cache/mongodb-binaries/` rather than waiting indefinitely for a pid that will never die.
