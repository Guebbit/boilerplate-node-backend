---
source: scenarios/support/ephemeral-mongo.ts
sha256: bada78210bb065708b122f00f4be6a8a0bf6d30b25d6c640a52c54c602ab18bf
generated_at: 2026-09-23T17:20:12.343101+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/ephemeral-mongo.ts

## Purpose

Resolves which MongoDB instance a test suite or demo should talk to. It is a pure branching/resolver module: if `NODE_TEST_MONGO_URI` is set it uses that external database; otherwise it delegates to an in-process `mongod` (via `mongodb-memory-server`). It does **not** start the server itself — that responsibility is injected by the caller, keeping the resolver's import graph free of the database driver.

## Key elements

- **`EphemeralMongo`** (interface) — the contract returned by resolution: `{ uri: string; stop: () => Promise<void> }`.
- **`startEphemeralMongo(options)`** (exported) — the sole public function. Reads `NODE_TEST_MONGO_URI`; on the external path returns a no-op `stop`. On the fallback path calls `usePreinstalledBinary()` then delegates to `options.startInProcess(options.dbPath)`.
- **`usePreinstalledBinary()`** (module-private) — sets `MONGOMS_SYSTEM_BINARY_VERSION_CHECK` and `MONGOMS_MD5_CHECK` to skip `mongodb-memory-server`'s download when `MONGOMS_SYSTEM_BINARY` names an existing file. Must run in the same process, before `startInProcess` is called.

## Relationships

- **`scenarios/support/ephemeral-mongod.ts`** — provides the real `startInProcessMongod` that callers pass in as `options.startInProcess`. This module never imports it directly (no default parameter), so the static dependency graph stays clean.
- **`scenarios/run-server.ts`** — a production/demo caller; passes `startInProcessMongod` from `./ephemeral-mongod.ts`.
- **`tests/support/global-setup.ts`** — Jest global setup; passes the same real starter.
- **`tests/cluster/support/cluster.ts`** — cluster-test harness; passes the same real starter.
- **`tests/unit/scenarios/ephemeral-mongo.test.ts`** — unit test; injects a fake `startInProcess` so the import graph never reaches `mongodb-memory-server`.
- **`src/infrastructure/adapters/logger.ts`** — imported (via relative path) for `logger.info` on each branch.

## Notes

- **`startInProcess` is required, not defaulted.** A default parameter would make the unit test's import graph reach `mongodb-memory-server`, violating the `unit-layer-stays-database-free` dependency-cruiser rule (which is reachability-based, not just direct-import-based).
- **Logger is imported with a relative path, not the `@infrastructure` alias.** `global-setup.ts` is loaded by Jest outside its `moduleNameMapper` scope, so the alias resolves at type-check time but fails at runtime.
- **No container-engine branch exists for Mongo, by design.** Unlike the Redis analog (`tests/cluster/support/redis.ts`), there is deliberately no third path that shells out to Docker/Podman. The docblock argues the use case it would cover ("engine available but binary download unwanted") is already handled by the in-process path with a pre-installed binary.
- **`options.dbPath` lifecycle is the caller's responsibility.** This module neither creates nor cleans up that directory.
