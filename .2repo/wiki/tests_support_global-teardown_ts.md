# tests/support/global-teardown.ts

## Purpose

Jest global teardown hook that cleans up after a test instance finishes: stops the shared in-memory MongoDB started by `global-setup.ts` and deletes the instance's temporary data directory. It exists so that no leftover processes or temp files outlive a test run.

## Key elements

- **`globalTeardown`** (default export) — async function, the Jest `globalTeardown` entry point. Performs two best-effort actions in sequence:
  1. Stops `globalThis.__testMongoServer` (the in-memory Mongo started by global setup).
  2. Recursively force-removes the directory returned by `instanceDataRoot()`.
  Both calls are wrapped in `.catch(() => {})` so a failure here never fails an already-completed test run.

## Relationships

- **`tests/support/global-setup.ts`** — the only dependency. This file imports `instanceDataRoot` and the `TestGlobals` type from it. Global setup starts the in-memory Mongo and writes the `instanceDataRoot` value onto `globalThis`; this file reads and tears down exactly those artifacts. The two files are paired: setup creates, teardown disposes.

## Notes

- **Best-effort by design.** Neither stopping the server nor removing files can cause a test-run failure. The Mongo process dies with the Node process regardless; the `.stop()` call just makes shutdown prompt.
- **Killed instances are NOT cleaned up by this file.** If a Jest instance is killed (e.g. `SIGKILL`), its data directory is not removed here. Instead, the *next* run's `global-setup.ts` sweeps stale per-instance directories. This file only handles the "graceful exit" path.
- The server handle is accessed via a cast on `globalThis` (`(globalThis as TestGlobals).__testMongoServer`) rather than a direct import, because Jest runs global setup and global teardown in separate module contexts.
