---
source: scenarios/support/ephemeral-mongod.ts
sha256: 2724bf9c6f1f5d1e26de97945fa409ad37fe533dc38f334b8f9bfc27c0c96740
generated_at: 2026-10-14T07:05:29.689741+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/ephemeral-mongod.ts

## Purpose

Provides the concrete implementation for starting an in-process `mongod` replica set via `mongodb-memory-server`. It lives in `scenarios/support/` (rather than `src/`) because `mongodb-memory-server` is a devDependency and the `not-to-dev-dep` rule forbids `src/` from importing one. Placing it under `scenarios/` lets both `scenarios/` and `tests/` share a single copy, since `tests/` may import `scenarios/`.

## Key elements

- **`CREATE_SERVER_TIMEOUT_MS`** (120 000) – upper bound for `MongoMemoryReplSet.create()`; guards against a silent infinite wait caused by a stale lock file under `~/.cache/mongodb-binaries/`.
- **`toEphemeralMongo`** – private adapter that maps a `MongoMemoryReplSet` handle to the `EphemeralMongo` shape (`uri` + `stop()`) that callers depend on.
- **`startInProcessMongod(databasePath?)`** *(exported)* – starts a single-member replica set (`count: 1`, `wiredTiger`) and returns a `Promise<EphemeralMongo>`. Races the create call against the timeout, logs an error and calls `process.exit(1)` on failure, clears the timer in `finally`.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** – provides the `EphemeralMongo` type that this file adapts to; contains the `startEphemeralMongo` orchestration half.
- **`src/infrastructure/adapters/logger.ts`** – imported (as a relative path, not the `@infrastructure` alias) for error logging on startup failure.
- **`scenarios/run-server.ts`** – caller of `startInProcessMongod`.
- **`tests/support/global-setup.ts`** – caller of `startInProcessMongod`; jest loads it outside normal module resolution, which is why the logger import must be relative.
- **`tests/cluster/support/cluster.ts`** – caller of `startInProcessMongod`.

## Notes

- The logger import uses a **relative path** (`../../src/infrastructure/adapters/logger`) deliberately. Jest's `moduleNameMapper` does not apply to files loaded via `global-setup`, so the `@infrastructure` alias would pass `tsc`/`eslint` but fail at runtime.
- A **replica set** (even with one member) is required instead of a standalone `mongod` because multi-document transactions (`startTransaction()`) are rejected by a standalone instance.
- `storageEngine: 'wiredTiger'` is specified explicitly; `mongodb-memory-server`'s default only follows the installed `mongod` version and does not guarantee it.
- On failure the function **exits the process** (`process.exit(1)`) rather than re-throwing, so no caller needs to handle a rejection.
