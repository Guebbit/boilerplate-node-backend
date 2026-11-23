---
source: scenarios/support/ephemeral-mongod.ts
source_sha256: 6896c6669f3f5e37c00ccaafec6279523c2caa0f285f2eb05c3d1846ccc56286
context_sha256: 8e38de8d3b1e18a5eade7560872fc81ad6eb10f88d4f15c4f7b71b570dc651e1
generated_at: 2026-11-22T01:48:54.310095+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/ephemeral-mongod.ts

## Purpose
Actually starts an in-process `mongod` using `mongodb-memory-server`. It is the half of `startEphemeralMongo` that has to live outside `src/`, because `mongodb-memory-server` is a devDependency and the `not-to-dev-dep` rule bars `src/` from importing one. One copy serves `scenarios/` and `tests/`, since `tests/` may import `scenarios/`.

## Key elements
- `startInProcessMongod(databasePath)` (exported): starts a single-member `MongoMemoryReplSet` and returns `Promise<EphemeralMongo>`.
  - Uses `count: 1`, `storageEngine: 'wiredTiger'` and `configSettings.heartbeatIntervalMillis: 250`.
  - Sets `instanceOpts` to `[{ dbPath: databasePath }]` when a path is given. Otherwise the library picks a temp directory.
  - Races creation against a 120 s timeout. If the timeout wins, the error message points at a stale lock file in the library's `mongodb-binaries` cache directory under the user's home.
  - On any failure it logs through `logger.error` and calls `process.exit(1)`.
  - Clears the timeout timer in `.finally`.
- `toEphemeralMongo` (internal): adapts a `MongoMemoryReplSet` to `{ uri, stop }`. `uri` comes from `getUri()`, and `stop()` resolves to `undefined`.
- `CREATE_SERVER_TIMEOUT_MS` (internal): 120_000 ms.

## Relationships
- `scenarios/support/ephemeral-mongo.ts`: supplies the `EphemeralMongo` type this file returns. The module doc describes this file as the half of `startEphemeralMongo` that is kept out of `src/`.
- `scenarios/run-server.ts`, `tests/support/global-setup.ts`, `tests/replicas/support/copies.ts`: the three callers that share this implementation.
- `src/infrastructure/adapters/logger.ts`: provides `logger`, used to report start-up failures.

## Notes
- A replica set is used rather than a standalone `mongod` because a standalone refuses `startTransaction()`.
- `heartbeatIntervalMillis` is set below 500 because the library hard-codes an election timeout of 500 ms. Server 9.0 rejects that against the default 2000 ms heartbeat.
- The logger is imported by relative path, not the `@infrastructure` alias. `tests/support/global-setup.ts` loads this file outside jest's normal module resolution, so `moduleNameMapper` does not apply and the alias would fail at runtime.
- The timeout exists because the library's lock on its machine-wide `mongodb-binaries` cache directory has no timeout of its own. If the lock-holder's pid was killed and then reused by another process, the wait never ends and prints nothing.
- A start-up failure terminates the process with `process.exit(1)` rather than rejecting, so callers never see a rejected promise.
