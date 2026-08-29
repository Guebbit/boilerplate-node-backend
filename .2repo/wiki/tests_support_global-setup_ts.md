# tests/support/global-setup.ts

## Purpose

Jest global setup that starts a single in-memory MongoDB server for the entire test run and passes its connection URI to worker processes via environment variables. It also owns the on-disk data directory for that server (under the repo's gitignored `.tmp/`) and sweeps directories left behind by dead sibling instances, preventing unbounded disk growth caused by Stryker's SIGKILL-then-restart cycle.

## Key elements

- **`TestGlobals`** (interface) — The only channel for passing the `MongoMemoryServer` handle to `globalTeardown`, since Jest runs setup and teardown as separate modules in the same process; the handle rides on `globalThis`.
- **`TEST_TMP_ROOT`** (exported const) — Base temp directory for all test instances. Resolves to `NODE_TEST_TMP_BASE` if set, otherwise `<repo>/.tmp`. Kept in the repo (not `/tmp`) so orphans are cheap to find and `rm -rf .tmp` is the full recovery step.
- **`instanceDataRoot()`** (exported fn) — Returns `TEST_TMP_ROOT/mongo/<pid>`, the per-instance directory that holds this run's single server data.
- **`isAlive(pid)`** (private fn) — Probes a pid with `process.kill(pid, 0)`; treats `EPERM` as alive to avoid deleting a live server's directory.
- **`sweepDeadInstances(mongoRoot)`** (private fn) — Removes `mongoRoot/<pid>` directories whose pids no longer exist and are not the current pid. Run at the top of `globalSetup` to reclaim space from previously SIGKILLed instances.
- **`globalSetup`** (default export) — The entry point Jest calls once before any worker. Creates the data root, starts `MongoMemoryServer`, sets `NODE_TEST_MONGO_URI` and `NODE_TEST_MONGO_ROOT` on `process.env` (the bridge into workers), and stores the server handle on `globalThis.__testMongoServer` for teardown.

## Relationships

- **`tests/support/global-teardown.ts`** — Jest runs this in the same process after all workers finish. It reads `globalThis.__testMongoServer` to call `.stop()`, and uses `instanceDataRoot()` to know which directory to remove. If Stryker SIGKILLs the process, teardown never runs and the directory is reclaimed by the *next* instance's `sweepDeadInstances` call.

## Notes

- `MongoMemoryServer` requires `dbPath` to already exist before `create()` is called; the code `mkdir`s it explicitly.
- One server, many databases. Individual suites call `server.getUri()` (read from the env var) and pick their own database name; they do **not** start their own servers.
- The whole ownership-by-pid design exists because Stryker restarts test-runner workers per mutant and SIGKILLs the old one, so teardown is the *exception* (clean exit), not the norm.
- `NODE_TEST_TMP_BASE` is an escape hatch for CI or shared-host environments where the default `.tmp/` location is undesirable.
