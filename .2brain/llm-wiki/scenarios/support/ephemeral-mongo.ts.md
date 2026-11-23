---
source: scenarios/support/ephemeral-mongo.ts
source_sha256: a756b88aea97b5fba196af5b76259f746a0cd4c65db3e135cd113b82c138580b
context_sha256: 95225748022d98f50f790c2379eda2e517ed56bb678d605feb88f75f879011a8
generated_at: 2026-11-22T01:48:41.447880+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/ephemeral-mongo.ts

## Purpose
Decides where a test suite or the demo profile gets its MongoDB. It only does the branching. If `NODE_TEST_MONGO_URI` is set, it uses that database. Otherwise it starts an in-process `mongod`, using a function the caller passes in. It mirrors `startRedis()` in `tests/replicas/support/redis.ts` (env var first, local fallback second).

## Key elements
- `EphemeralMongo` (interface): a running Mongo, with `uri` (connection string) and `stop()` (shuts it down and removes its data).
- `startEphemeralMongo({ dbPath?, startInProcess })`: the main export.
  - **External path:** if `NODE_TEST_MONGO_URI` is set and non-blank after trimming, it logs and returns that URI with a no-op `stop`. `startInProcess` is never called.
  - **In-process path:** it calls `usePreinstalledBinary()`, logs, then returns `startInProcess(dbPath)`.
- `usePreinstalledBinary()` (internal): if `MONGOMS_SYSTEM_BINARY` names a file that exists, it sets `MONGOMS_SYSTEM_BINARY_VERSION_CHECK=false` and `MONGOMS_MD5_CHECK=false`. This lets `mongodb-memory-server` skip its ~100 MB download. Otherwise it does nothing.

## Relationships
- `scenarios/support/ephemeral-mongod.ts`: provides `startInProcessMongod`, the real implementation of `startInProcess`. This file does not import it.
- `scenarios/run-server.ts`, `tests/support/global-setup.ts` and `tests/replicas/support/copies.ts`: the callers. Each passes `startInProcessMongod` itself. `global-setup.ts` owns the lifecycle of the `dbPath` directory.
- `tests/unit/scenarios/ephemeral-mongo.test.ts`: passes a fake `startInProcess`, so the unit test never loads `mongodb-memory-server`.
- `src/infrastructure/adapters/logger.ts`: the `logger` used for the `[mongo] external` and `[mongo] ephemeral` info messages.

## Notes
- `startInProcess` deliberately has no default. A default would need a static import of `./ephemeral-mongod`. The `unit-layer-stays-database-free` dependency-cruiser rule checks reachability, so that import would pull `mongodb-memory-server` into the unit test's graph.
- There is no container-per-run branch. It would make a container engine mandatory to run a test.
- The logger is imported by relative path, not the `@infrastructure` alias. `global-setup.ts` is loaded by jest outside `moduleNameMapper`, so the alias would pass `tsc` and eslint but fail at runtime.
- `usePreinstalledBinary()` only sets env vars. It must run in the same process as `startInProcess`, and before it, or the library reads the variables too late.
- If `MONGOMS_SYSTEM_BINARY` is unset or the file is missing, the library downloads its own `mongod`. It may also reuse a copy cached under `MONGOMS_DOWNLOAD_DIR`, which the `dev` stage of `docker/Dockerfile` bakes in at build time.
