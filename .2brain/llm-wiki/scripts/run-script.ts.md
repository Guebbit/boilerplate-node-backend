---
source: scripts/run-script.ts
sha256: 0f2e384d263c7fadec8953e9fe30b7aaa5b9e84f1e9c80e2d1443ccce38061a3
generated_at: 2026-11-08T02:57:20.354984+00:00
model: ollama:qwen3.8:27b
---

# scripts/run-script.ts

## Purpose

Entry-point wrapper for the one-shot scripts under `scripts/db/` and `scripts/ops/`. It centralises four concerns a bare promise chain does not handle: a non-zero exit code on failure, guaranteed cleanup (connection close) on both success and failure paths, a readable logged error, and a job-outcome record that `GET /observability/health` and `job_last_success_timestamp_seconds` can read.

## Key elements

- **`runScript`** *(exported)* — Public API. Dynamically imports `src/app/config` to call `assertProcessConfig()`, then delegates to `runChecked`. On validation failure, delegates to `refuseToRun`. Returns a promise that **never rejects**; failure is signalled solely through `process.exitCode`.
- **`runChecked`** *(internal)* — Executes the script body (`main`), records a successful or failed job outcome via `recordJobOutcome`, and always runs `cleanup` in a `finally` block. A cleanup failure is logged as a warning but does **not** alter `process.exitCode`.
- **`refuseToRun`** *(internal)* — Config-validation failure path: logs the error, sets `exitCode = 1`, still runs the caller's `cleanup`, and does **not** record a job outcome (the DB the bad config describes may be unreachable).

## Relationships

- **`src/app/config.ts`** — Dynamically imported at call time; `assertProcessConfig()` gates every run before the script body loads.
- **`src/infrastructure/adapters/logger.ts`** — All success, failure, and cleanup-failure messages flow through `logger`.
- **`src/infrastructure/persistence/lease.ts`** — `recordJobOutcome` writes the success/failure row that observability endpoints read.
- **`scripts/db/*`, `scripts/ops/*`** (bootstrap-access, cache-clear, sync-indexes, check-config, reapply-erasures, reencrypt, run-job) — These are **callers** of `runScript`; each passes its own npm-script name, a `main` closure, and a `cleanup` closure.
- **`scripts/security/refresh-breached-passwords.ts`** — Same caller relationship as above.
- **`tests/unit/scripts/run-script.test.ts`** — Unit tests for the three functions above.

## Notes

- Uses `process.exitCode = 1` rather than `process.exit()` so Node can drain stdout and finish pending I/O before the process actually terminates.
- `cleanup` is a **required** parameter with no default. The JSDoc explicitly calls out that a silent no-op default would let a script stop closing its connections without anyone noticing.
- `name` is `undefined` for `db:*` one-off setup scripts (no scheduled interval to alert on; some, like `db:cache:clear`, never open Mongo) and for `reap:inactive-accounts` (records its own outcome via `withLease`).
- Config validation is deferred behind a dynamic `import()` so a script that fails validation never loads its own dependencies.
- A cleanup failure is intentionally a `warn`, not an error: it must not flip a successful (or already-failed) run to a different exit code.
