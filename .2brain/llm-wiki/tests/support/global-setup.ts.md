---
source: tests/support/global-setup.ts
sha256: fab01c0fcb58e6b7b71864a86349629e418475cad46e81e6675d16c03a52fe44
generated_at: 2026-10-15T12:58:28.736534+00:00
model: ollama:qwen3.8:27b
---

# tests/support/global-setup.ts

## Purpose

Jest `globalSetup` entry point that runs once per jest instance in the main process, before any worker spawns. It starts a single shared in-memory MongoDB server, claims a per-pid file-sandbox root, and publishes both via `process.env` (for workers) and `globalThis` (for `globalTeardown`). It also sweeps stale per-instance directories left behind by SIGKILLed runs (the normal Stryker mutation-testing path) before claiming its own.

## Key elements

- **`globalSetup`** (default export) — the function jest calls. Sets `NODE_PSEUDONYM_KEY`, claims the file-sandbox and Mongo data roots, creates the `dbPath` directory, starts the ephemeral Mongo via `startEphemeralMongo`, stores the server handle on `globalThis`, and exports `NODE_TEST_MONGO_URI` / `NODE_TEST_MONGO_ROOT`.
- **`TestGlobals`** (exported interface) — the shape of `globalThis` entries that bridge `globalSetup` → `globalTeardown` (the only channel, since `process.env` carries strings only).
- **`TEST_TMP_ROOT`** (exported const) — base directory for all per-instance data under the repo (`tmp/test/`), overridable via `NODE_TEST_TMP_BASE`.
- **`instanceDataRoot()` / `instanceFilesRoot()`** (exported fns) — return this instance's pid-scoped subdirectory under `TEST_TMP_ROOT`.
- **`isAlive(pid)`** (module-private) — checks liveness with `process.kill(pid, 0)`; treats `EPERM` as alive.
- **`sweepDeadInstances(mongoRoot)`** (module-private) — removes pid-named subdirectories whose pid is no longer running, skipping the current pid.
- **`claimInstanceRoot(root)`** (module-private) — sweeps the parent, then `rm` + `mkdir` the target so it exists and is empty.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — imports `startEphemeralMongo` and the `EphemeralMongo` type; the actual server-lifecycle logic delegated here.
- **`scenarios/support/ephemeral-mongod.ts`** — imports `startInProcessMongod`, passed as the `startInProcess` option so the mongod binary runs in-process rather than as a child process.
- **`tests/support/file-sandbox.ts`** — imports `FILE_SANDBOX_ROOT_VARIABLE`; this file sets that env var to the claimed per-pid files root, which `file-sandbox.ts` reads to redirect test writes.
- **`tests/support/global-teardown.ts`** — the paired `globalTeardown` that reads `(globalThis as TestGlobals).__testMongoServer` to call `.stop()` and deletes this instance's data root.

## Notes

- **Relative imports, not `@infrastructure`/`@tests` aliases.** `globalSetup` is loaded outside jest's `moduleNameMapper` resolution, so aliases pass `tsc`/`eslint` but crash at jest runtime.
- **Ownership by pid, not detection.** Each instance owns exactly one directory (`…/mongo/<pid>`); cleanup never needs to inspect `mongod.lock` or apply age thresholds. The only non-trivial question is whether a *foreign* pid is still alive, answered by signal-0.
- **Stryker SIGKILL path.** Teardown never runs; `sweepDeadInstances` compensates by removing pid-named dirs whose pid is dead. This prevents unbounded growth in `tmp/test/mongo/` (measured 71 GB / 212 dirs without the sweep).
- **`dbPath` must pre-exist.** `mongodb-memory-server` reads the directory before starting; `globalSetup` creates it with `mkdir` before calling `startEphemeralMongo`.
- **`NODE_PSEUDONYM_KEY` fallback.** Set unconditionally (only if absent) because `logger.ts` on the import chain expects it and `setup-environment` hasn't run in this process.
