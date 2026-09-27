---
source: tests/support/global-setup.ts
sha256: 14162cb6c1bf3a4189c634339eac8bd07bfb82bfe482293e33b095ae187c5643
generated_at: 2026-09-27T16:00:07.745654+00:00
model: ollama:qwen3.8:27b
---

# tests/support/global-setup.ts

## Purpose

Jest `globalSetup` hook that runs once per jest instance in the main process before any worker starts. It starts a single shared ephemeral MongoDB server (so every test suite gets its own database on one `mongod` rather than spawning per-suite servers), claims per-instance directories for that server's data and for the file sandbox, and publishes the connection URI and sandbox root to workers via `process.env`.

## Key elements

- **`globalSetup` (default export)** — async entry point. Sets `FILE_SANDBOX_ROOT_VARIABLE` and `NODE_TEST_MONGO_ROOT` on `process.env`, creates the `dbPath` directory, calls `startEphemeralMongo` to launch the server, publishes `NODE_TEST_MONGO_URI`, and stashes the server handle on `globalThis.__testMongoServer` for teardown.
- **`TEST_TMP_ROOT`** — base directory for all test-instance data. Defaults to `<repo>/tmp/test/`; overridable via `NODE_TEST_TMP_BASE`.
- **`instanceDataRoot()` / `instanceFilesRoot()`** — return `<TEST_TMP_ROOT>/{mongo,files}/<pid>`, giving each jest instance an isolated slice.
- **`isAlive(pid)`** — `process.kill(pid, 0)` check; treats `EPERM` as alive.
- **`sweepDeadInstances(root)`** — deletes pid-named subdirectories whose owner pid no longer exists (cleanup after Stryker's SIGKILLed workers).
- **`claimInstanceRoot(root)`** — sweeps dead siblings, removes and re-creates the instance's own directory, returns the path.
- **`TestGlobals`** — interface for the `globalThis` shape that carries the `EphemeralMongo` handle to `global-teardown`.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — provides `startEphemeralMongo` and the `EphemeralMongo` type; this file calls it to obtain the running server.
- **`scenarios/support/ephemeral-mongod.ts`** — provides `startInProcessMongod`, passed as the `startInProcess` option to control how the `mongod` process is spawned.
- **`tests/support/file-sandbox.ts`** — exports `FILE_SANDBOX_ROOT_VARIABLE`, the env-var name this file writes the sandbox root into.
- **`tests/support/global-teardown.ts`** — runs after all workers finish in the same process; reads `globalThis.__testMongoServer` to stop the server and removes the instance's data directory.
- Test suites (e.g. `src/modules/account/tests/unit/two-factor.test.ts`) consume the server URI from `process.env.NODE_TEST_MONGO_URI` and the sandbox root from the published variable; they do not import this file directly.

## Notes

- **Relative imports, not aliases.** `globalSetup` is loaded outside Jest's normal module resolution where `moduleNameMapper` does not apply. Aliases resolve at `tsc`/`eslint` time but fail at Jest's own runtime, so this file uses `../../scenarios/...` and `./file-sandbox`.
- **`globalThis` is the only channel to teardown.** Jest runs `globalSetup` and `globalTeardown` as separate modules in the same process; `process.env` carries strings only, so the non-serializable server handle must ride on `globalThis`.
- **`NODE_TEST_MONGO_URI` short-circuit.** If that env var is already set, `startEphemeralMongo` skips starting a server entirely — the `dbPath` directory creation is still performed but is harmless.
- **Stryker interaction.** Stryker SIGKILLs a worker per timed-out mutant; teardown never runs, leaving ~200 MB of `dbpath` behind. `sweepDeadInstances` on the *next* instance start reclaims those directories by checking pid liveness, avoiding unbounded growth in `tmp/test/mongo/`.
