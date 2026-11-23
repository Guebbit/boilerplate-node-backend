---
source: scripts/run-script.ts
source_sha256: 74e75d37fb8d497f831e9fe23fc92b334aaea1f23b64466d88383a93b6e75d7a
context_sha256: 25fbca935e6c8ee41ba29f762204ed3cd1a02d8588d64bb9b53c8b6d70f0bdb6
generated_at: 2026-11-22T02:13:28.423751+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/run-script.ts

## Purpose
Entry-point wrapper for the one-shot scripts under `db/` and `ops/` (and the cron jobs in `docker/crontab`). It gives them a non-zero exit code on failure, cleanup on the failure path, a readable logged error, and a recorded job outcome that the health endpoint and `job_last_success_timestamp_seconds` can read.

## Key elements
- `runScript(name, main, cleanup)` — the only export. It loads development doubles, lazily imports `../src/app/config` and runs `assertProcessConfig()`, then runs the script. The returned promise never rejects; failure is signalled through `process.exitCode`.
  - `name`: the npm script name (e.g. `reap:orders`), used as the job identity. `undefined` skips outcome recording.
  - `main`: the script's work. Throwing marks the run as failed.
  - `cleanup`: required. It runs on both the success and failure paths.
- `runChecked` (internal) — runs `main`, then records `{ failed: false }` on success. On a throw it logs the message and stack, sets `exitCode = 1`, and records `{ failed: true, error }`. `cleanup` runs in `finally`. A cleanup error is logged as a warning and does not change the exit code.
- `refuseToRun` (internal) — used when config validation fails. It logs the error, sets `exitCode = 1`, and still calls `cleanup`. It records no job outcome, because the job never ran and recording needs the database.

## Relationships
- Imports `logger` from `@infrastructure/adapters/logger` for all error and warning output.
- Imports `recordJobOutcome` from `@infrastructure/persistence/lease` to write the job outcome.
- Imports `loadDevelopmentDoubles` from `src/app/development-doubles`.
- Lazily imports `assertProcessConfig` from `src/app/config`.
- Consumers among the graph neighbors are the scripts in `scripts/db/` (`bootstrap-access`, `cache-clear`, `sync-indexes`), `scripts/ops/` (`check-config`, `reapply-erasures`, `reencrypt`, `run-job`), `scripts/security/refresh-breached-passwords.ts` and `scenarios/apply.ts`. They are listed as graph neighbors, and the file header says it wraps the `db/` and `ops/` scripts. `tests/unit/scripts/run-script.test.ts` covers it, and `tests/replicas/support/write-notification.ts` is also a neighbor.

## Notes
- It uses `process.exitCode` rather than `process.exit()`, so Node can drain stdout and pending handles instead of truncating in-flight log writes.
- The development doubles load first (a no-op outside `NODE_ENV=development`), so config validation judges the environment the process will actually run with. For example, a `log` mail transport is valid only there.
- Pass `name = undefined` for one-off `db:*`/`access:*` setup scripts. `db:cache:clear` never opens Mongo, so writing a lease row for it would fail.
- `reap:inactive-accounts` also passes `undefined`, because it records its outcome through its own `withLease` document.
- The config module is imported lazily, so a script that fails validation never loads what it would have run.
