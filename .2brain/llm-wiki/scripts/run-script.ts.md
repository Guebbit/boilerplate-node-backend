---
source: scripts/run-script.ts
sha256: 50bcbb703734a8d4e32200f652418b58e98bec165c732e1abdad7b4d1b200b29
generated_at: 2026-10-14T07:30:16.595496+00:00
model: ollama:qwen3.8:27b
---

# scripts/run-script.ts

## Purpose

Entry-point wrapper for all one-shot scripts under `scripts/db/` and `scripts/ops/`. It adds four things a bare promise chain does not provide: a non-zero exit code on failure, guaranteed cleanup of open handles (Mongo, Redis) on the error path, a readable log line through the shared logger, and a job-outcome record that `GET /observability/health` and `job_last_success_timestamp_seconds` can read.

## Key elements

- **`runScript`** (exported) — The public API. Lazily imports `src/app/config` and calls `assertProcessConfig()` first so a bad environment names itself before any work begins. On valid config delegates to `runChecked`; on validation failure calls `refuseToRun`. Returns a promise that always resolves; failure is signalled solely via `process.exitCode`.
- **`runChecked`** (internal) — Executes `main()`, records a successful or failed job outcome via `recordJobOutcome`, and runs `cleanup()` in a `finally` block. A cleanup failure is logged as a warning and never overrides the already-set exit code.
- **`refuseToRun`** (internal) — Handles the config-validation failure path: logs the error, sets `exitCode = 1`, runs the caller's `cleanup`, and does **not** record a job outcome (the DB the job would need may be the misconfigured one).

## Relationships

- **Callers (all `scripts/ops/reap-*` and `scripts/db/*` files)** — Each script in the graph neighbors list calls `runScript(name, main, cleanup)`, passing its npm-script name (e.g. `"reap:orders"`) as the job identity. `reap:inactive-accounts` is the one exception: it passes `undefined` for the name and records its own outcome through its `withLease` document. `db:cache:clear` also passes `undefined` because it never opens Mongo.
- **`@infrastructure/persistence/lease`** — Provides `recordJobOutcome`, which writes the success/failure row that health checks and alerting read.
- **`@infrastructure/adapters/logger`** — Shared structured logger used for all error/warning output.
- **`../src/app/config`** — Source of `assertProcessConfig`, the environment validation gate.
- **`@guebbit/js-toolkit`** — Supplies `extractErrorMessage` for readable error strings.

## Notes

- Uses `process.exitCode = 1` rather than `process.exit()` so that Node can drain stdout and flush in-flight log writes before the process terminates.
- `cleanup` is a required parameter with no default: every script in this set opens a connection, and a silent no-op default would let one stop closing its handle without a type error.
- Config validation is a lazy `import()`, so a script that fails validation never loads (or side-effects) the modules it would have run.
- The returned promise always resolves; callers should not attach `.catch` and should rely on the process exit code for CI/shell-chaining.
