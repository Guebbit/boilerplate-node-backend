---
source: scenarios/support/ephemeral-mongod.ts
sha256: 9897d807cc853e7a77b65e9d4ad8f234c00622656ee92a67fa868ceab6fcd37b
generated_at: 2026-09-23T17:20:20.966504+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/ephemeral-mongod.ts

## Purpose

Starts an in-process `mongod` via `mongodb-memory-server` and returns an `EphemeralMongo`-shaped handle. Lives under `scenarios/` (not `src/`) because `mongodb-memory-server` is a devDependency, and the `not-to-dev-dep` lint rule forbids `src/` from importing one.

## Key elements

- **`startInProcessMongod(databasePath?)`** — sole export. Creates a `MongoMemoryServer`, races it against a 120 s timeout, adapts the result to the `EphemeralMongo` interface, and on failure logs the error and calls `process.exit(1)`.
- **`CREATE_SERVER_TIMEOUT_MS`** — 120 000 ms guard against a silent hang caused by a stale `~/.cache/mongodb-binaries` lock file (a killed PID that gets reused means `mongodb-memory-server`'s 3 s poll never terminates).
- **`toEphemeralMongo(server)`** — private adapter mapping `MongoMemoryServer` → `{ uri, stop }`.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — provides the `EphemeralMongo` type that this file adapts to; the two together form the public `startEphemeralMongo` API.
- **`src/infrastructure/adapters/logger.ts`** — imported (relative path) for error logging before `process.exit`.
- **`scenarios/run-server.ts`**, **`tests/support/global-setup.ts`**, **`tests/cluster/support/cluster.ts`** — all three import `startInProcessMongod` from this file; `tests/` is allowed to reach into `scenarios/`, so one copy serves all callers.

## Notes

- The `logger` import uses a **relative path** (`../../src/…`), not the `@infrastructure` alias. `jest` loads `global-setup.ts` outside its `moduleNameMapper` resolution, so the alias would compile but fail at runtime.
- The timeout timer is cleared in `.finally()`. A bare `setTimeout` inside `Promise.race` keeps the event loop alive after the race settles; `clearTimeout` prevents the guard from outliving the operation it guards.
- On failure the function **exits the process** rather than rejecting: `mongodb-memory-server`'s internal `setInterval` (the lock-file poll) would keep the process alive past a normal rejection, so a logged error + `exit(1)` is strictly better than a rejection that hangs.
