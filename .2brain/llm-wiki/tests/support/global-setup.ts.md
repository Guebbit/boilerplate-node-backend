---
source: tests/support/global-setup.ts
sha256: fab01c0fcb58e6b7b71864a86349629e418475cad46e81e6675d16c03a52fe44
generated_at: 2026-11-08T09:55:06.218915+00:00
model: ollama:qwen3.8:27b
---

# tests/support/global-setup.ts

## Purpose

Jest `globalSetup` hook that runs once in the main process before any worker starts. It launches a single shared ephemeral MongoDB server (all suites get their own database on it, not their own `mongod`), claims per-instance temp directories for both Mongo data and the file sandbox, and publishes the connection URI / roots to workers via `process.env`. It also sweeps temp directories left by dead Jest instances to prevent unbounded `/tmp` or repo-`tmp/` growth under Stryker's SIGKILL-per-mutant lifecycle.

## Key elements

- **`TestGlobals`** (interface) – The only typed contract between `globalSetup` and `globalTeardown`; carries the `EphemeralMongo` handle on `globalThis` because `process.env` can't hold objects.
- **`TEST_TMP_ROOT`** – Base directory for all per-instance temp data. Defaults to `<repo>/tmp/test`; overridable via `NODE_TEST_TMP_BASE`. Scoped away from `tmp/reports/` so Stryker's incremental cache is untouched.
- **`instanceDataRoot()`** – Per-pid directory for this instance's Mongo `dbpath`.
- **`instanceFilesRoot()`** – Per-pid directory for this instance's file-sandbox writes.
- **`isAlive(pid)`** – `process.kill(pid, 0)` liveness probe; treats `EPERM` as alive (process exists, different owner).
- **`sweepDeadInstances(root)`** – Deletes sibling directories whose pids are no longer alive. Skips the current pid.
- **`claimInstanceRoot(root)`** – Sweeps dead siblings, then `rm` + `mkdir` to guarantee a fresh, empty root.
- **`globalSetup`** (default export) – Sets `NODE_PSEUDONYM_KEY` (no `setup-environment` yet), claims both roots, pre-creates `dbPath`, calls `startEphemeralMongo`, and publishes `NODE_TEST_MONGO_URI` + `NODE_TEST_MONGO_ROOT` to `process.env` for workers.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** – Imports `startEphemeralMongo` and the `EphemeralMongo` type; the actual server startup is delegated here.
- **`scenarios/support/ephemeral-mongod.ts`** – Imports `startInProcessMongod`, passed as the `startInProcess` strategy to `startEphemeralMongo`.
- **`tests/support/file-sandbox.ts`** – Imports `FILE_SANDBOX_ROOT_VARIABLE` (the `process.env` key) so this file can publish the sandbox root that `file-sandbox.ts` later reads in workers.
- **`tests/support/global-teardown.ts`** – Reads `globalThis.__testMongoServer` (set here) to stop the Mongo server and clean up after the run.

## Notes

- **Relative imports, not aliases.** `globalSetup` executes outside Jest's `moduleNameMapper` resolution, so `@infrastructure` / `@tests` aliases would fail at runtime even though they type-check. All imports in this file are deliberately relative.
- **Two channels to the outside world.** Strings (URI, roots) go through `process.env` (main → worker). The server object goes through `globalThis` (main → teardown, same process). Neither channel is interchangeable.
- **External Mongo short-circuit.** If `NODE_TEST_MONGO_URI` is already set in the environment, `startEphemeralMongo` skips starting a local server entirely; `dbPath` creation is still performed but harmless.
- **`dbPath` must pre-exist.** `mongodb-memory-server` reads the directory before starting the process, so `claimInstanceRoot` + an explicit `mkdir(dbPath)` run before `startEphemeralMongo`.
- **Sweep safety under Stryker.** Stryker SIGKILLs a worker per timed-out mutant; `globalTeardown` never fires. The per-pid directory naming plus `sweepDeadInstances` on the *next* instance's start is the only cleanup path in that scenario.
