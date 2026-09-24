---
source: tests/support/global-setup.ts
sha256: 5ffec44bf7d0f1c1ab5d88b13dc6a23d1dec24da9f8533c1efe344e6bc277b3d
generated_at: 2026-09-23T20:11:16.755332+00:00
model: ollama:qwen3.8:27b
---

# tests/support/global-setup.ts

## Purpose

Jest `globalSetup` hook that runs once per jest instance before any worker starts. It starts a **single** ephemeral `mongod` process shared by all test suites, publishes the connection URI and per-instance data roots via `process.env`, and claims a file-sandbox directory. It also sweeps data directories left behind by previously SIGKILLed instances (Stryker's normal shutdown mode) to prevent unbounded disk growth in the repo's `tmp/test/`.

## Key elements

- **`globalSetup` (default export)** — The entry point. Sets `FILE_SANDBOX_ROOT_VARIABLE`, `NODE_TEST_MONGO_ROOT`, and `NODE_TEST_MONGO_URI` on `process.env`; stores the `EphemeralMongo` handle on `globalThis.__testMongoServer` for `globalTeardown`.
- **`TestGlobals` (interface)** — Type for the `globalThis` slot carrying the Mongo server handle. Exists because `process.env` only carries strings, but teardown needs the actual handle to call `stop()`.
- **`TEST_TMP_ROOT`** — Base directory for all per-instance test data. Defaults to `<repo>/tmp/test/` (overridable via `NODE_TEST_TMP_BASE`). Chosen over `os.tmpdir()` so stranded data is gitignored, repo-scoped, and sweepable without touching `tmp/reports/` (Stryker's incremental cache).
- **`instanceDataRoot()`** — Returns `TEST_TMP_ROOT/mongo/<pid>` — this instance's Mongo `dbpath`.
- **`instanceFilesRoot()`** — Returns `TEST_TMP_ROOT/files/<pid>` — this instance's file-sandbox root.
- **`isAlive(pid)`** — Sends signal `0`; returns `true` on success or `EPERM`, `false` on `ESRCH`. Distinguishes "no such process" from "not mine".
- **`sweepDeadInstances(mongoRoot)`** — Reads the sibling directory, removes subdirectories named for pids that no longer exist (skips own pid). Prevents accumulation under repeated Stryker restarts.
- **`claimInstanceRoot(root)`** — Sweeps dead siblings, `rm -rf` the target, `mkdir -p` it. Guarantees a fresh, empty, exclusively-owned directory.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — Imports `startEphemeralMongo` and the `EphemeralMongo` type. The returned server object is stored on `globalThis` and its `uri` published via `process.env`.
- **`scenarios/support/ephemeral-mongod.ts`** — Imports `startInProcessMongod`, passed as the `startInProcess` strategy to `startEphemeralMongo` so the binary runs in-process rather than spawning a detached OS process.
- **`tests/support/file-sandbox.ts`** — Imports `FILE_SANDBOX_ROOT_VARIABLE`. This file sets that env var to the claimed `instanceFilesRoot()`; `file-sandbox.ts` reads it in workers to redirect test-file writes.
- **`tests/support/global-teardown.ts`** — Consumes `globalThis.__testMongoServer` (set here) to call `stop()` on the shared server after all workers finish.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — An end consumer of the `NODE_TEST_MONGO_URI` env var published here; does not import this file directly.

## Notes

- **Relative imports are intentional.** Jest loads `globalSetup` outside its normal module-resolution pipeline, so `moduleNameMapper` aliases (`@infrastructure`, `@tests`) resolve at `tsc`/`eslint` time but **fail at jest runtime**. This file must keep `../../` relative paths.
- **Two channels for cross-boundary data.** `process.env` crosses the main-process → worker-process boundary; `globalThis` only works because Jest runs `globalSetup` and `globalTeardown` in the _same_ process. Don't add a worker-facing value to `globalThis` expecting workers to see it.
- **`dbPath` must pre-exist.** `mongodb-memory-server` reads the directory before spawning `mongod`; `globalSetup` creates `root/server/` before calling `startEphemeralMongo`.
- **`NODE_TEST_MONGO_URI` short-circuit.** If already set in the environment (e.g. an external DB), `startEphemeralMongo` skips starting a server entirely. The `dbPath` `mkdir` is harmless but unused in that case.
- **Sweep is best-effort.** Individual `rm` failures are swallowed (`.catch(() => {})`); a permission error on one dead instance's directory will not block the run.
