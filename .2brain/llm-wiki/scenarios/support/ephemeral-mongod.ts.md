---
source: scenarios/support/ephemeral-mongod.ts
sha256: 243074f5335432ecd69a4a3dba9de72c703a83937cba01931b5f27fa7e70c50d
generated_at: 2026-11-08T02:35:07.280527+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/ephemeral-mongod.ts

## Purpose

Starts a real, single-member `mongod` replica set in-process via `mongodb-memory-server` and adapts it to the `EphemeralMongo` interface. Lives in `scenarios/support/` (not `src/`) because `mongodb-memory-server` is a devDependency and the `not-to-dev-dep` rule forbids `src/` from importing one.

## Key elements

- **`startInProcessMongod(databasePath?)`** — the sole export. Spins up a one-member `MongoMemoryReplSet` (wiredTiger, `heartbeatIntervalMillis: 250`) and returns a `Promise<EphemeralMongo>`. Races `MongoMemoryReplSet.create()` against a 120 s timeout to catch a stale binary-download lock hang. On failure, logs via `logger.error` and calls `process.exit(1)`.
- **`toEphemeralMongo(server)`** — private adapter mapping `MongoMemoryReplSet` → `{ uri, stop() }`.
- **`CREATE_SERVER_TIMEOUT_MS`** (120 000 ms) — distinguishes a genuine stall (stale pid in `~/.cache/mongodb-binaries` lock) from a slow first-time download.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — provides the `EphemeralMongo` type that this file adapts to.
- **`scenarios/run-server.ts`** — imports `startInProcessMongod` to bring up a local mongod before starting the server.
- **`tests/support/global-setup.ts`** — imports `startInProcessMongod` to create a shared mongod for the jest test suite.
- **`tests/cluster/support/cluster.ts`** — imports `startInProcessMongod` for cluster-test fixtures.
- **`src/infrastructure/adapters/logger.ts`** — imported **by relative path** (`../../src/...`) rather than the `@infrastructure` alias, because `global-setup.ts` is loaded by jest outside its `moduleNameMapper` context.

## Notes

- **Relative import is intentional, not a mistake.** `tsc`/`eslint` resolve the alias fine, but jest's `global-setup.ts` bypasses `moduleNameMapper`, so the alias would fail at runtime. Do not "fix" it to the alias.
- **Replica set, not standalone.** Multi-document transactions require a replica set; `count: 1` avoids real replication overhead while satisfying the `startTransaction()` requirement.
- **`heartbeatIntervalMillis: 250`** works around a library hard-coded 500 ms election timeout that MongoDB Server 9.0 rejects against the default 2000 ms heartbeat. The spread preserves the library's 500 ms election timeout.
- **`process.exit(1)` on failure** is deliberate: if the mongod cannot start, the dependent process (server or test runner) cannot function, so a clean abort beats a hung promise.
