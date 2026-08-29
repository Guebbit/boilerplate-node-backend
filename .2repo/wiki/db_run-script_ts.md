# db/run-script.ts

## Purpose

Entry-point wrapper for the one-shot scripts under `db/`. It guarantees three things a bare `async` main lacks: a non-zero exit code on failure, guaranteed resource cleanup on both success and failure paths, and a structured error log. It centralises the run/exit/lifecycle logic so individual scripts stay focused on their work.

## Key elements

- **`runScript(main, cleanup)`** — the sole export. Runs `main()` to completion, sets `process.exitCode = 1` on any thrown error, and always invokes `cleanup()` in a `finally` block. Cleanup failures are logged at `warn` level and do *not* alter the exit code (a failed disconnect on an already-dead socket must not flip a successful run red). Both parameters are required; `cleanup` has no default so a forgotten connection close is a compile error rather than a silent leak.

## Relationships

- **`db/cache-clear.ts`** — consumer; passes its cache-clearing work as `main` and its Mongo/Redis close logic as `cleanup`.
- **`db/demo/index.ts`** — consumer; same pattern for the demo seed script.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` instance used for the error and cleanup-warning log lines, keeping log format consistent with the rest of the codebase.
- **`tests/unit/db/run-script.test.ts`** — unit-tests the success, failure, and cleanup-failure paths of `runScript`.

## Notes

- Uses `process.exitCode = 1` rather than `process.exit(1)`. This lets Node flush stdout and close pending sockets before the process actually terminates, preventing truncated log output.
- The function always resolves (never rejects). Callers should not add their own `.catch`; the exit code is the contract.
- Cleanup errors are intentionally downgraded to a warning, not an error: the job's success/failure verdict is already decided before `finally` runs.
