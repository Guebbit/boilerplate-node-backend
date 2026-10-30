---
source: scripts/run-script.ts
sha256: 0f2e384d263c7fadec8953e9fe30b7aaa5b9e84f1e9c80e2d1443ccce38061a3
generated_at: 2026-10-29T01:41:32.352803+00:00
model: ollama:qwen3.8:27b
---

# scripts/run-script.ts

## Purpose

Entry-point wrapper for every one-shot script under `scripts/db/` and `scripts/ops/`. It guarantees four things a bare promise chain does not: a non-zero `process.exitCode` on failure, cleanup (connection close) on both success and failure paths, a structured error log line, and a recorded job outcome visible to `/observability/health`. Every crontab line in `docker/crontab` funnels through this single function.

## Key elements

- **`runScript(name, main, cleanup)`** (exported) — Top-level entry. Lazily imports `src/app/config`, calls `assertProcessConfig()` first (so a bad environment is reported before any work), then delegates to `runChecked` or `refuseToRun`. Returns a promise that **never rejects**; failure is signalled solely via `process.exitCode = 1`.
- **`runChecked(name, main, cleanup)`** (internal) — Executes `main`, records the job outcome via `recordJobOutcome`, logs errors with stack traces, and always runs `cleanup` in a `finally` block. A cleanup failure is logged as a warning but does **not** override the already-set exit code.
- **`refuseToRun(error, cleanup)`** (internal) — Called when config validation fails. Logs the error, sets `exitCode = 1`, still runs the caller's `cleanup`, but does **not** record a job outcome (the database the job would have used may itself be misconfigured).
- **`name` parameter convention** — The npm-script string (e.g. `reap:orders`) used as the identity in `job_last_success_timestamp_seconds{task="…"}`. Pass `undefined` for one-off setup scripts that have no schedule or never open a persistent connection (e.g. `db:cache:clear`).
- **`cleanup` is required, not defaulted** — Deliberate: a silent no-op default would let a script stop closing its Mongo/Redis handles without a compile error.

## Relationships

- **`src/app/config.ts`** — Lazily imported; provides `assertProcessConfig` which validates environment variables before any script work begins.
- **`src/infrastructure/adapters/logger.ts`** — Provides the shared `logger` used for all error/warning output in this file.
- **`src/infrastructure/persistence/lease.ts`** — Provides `recordJobOutcome`, which writes the success/failure row that `/observability/health` and the `job_last_success_timestamp_seconds` metric read.
- **`scripts/db/*` and `scripts/ops/*` callers** (`bootstrap-access`, `cache-clear`, `sync-indexes`, `check-config`, `reencrypt`, `run-job`) — Each invokes `runScript` with its own `main` and `cleanup`, passing its npm-script name.
- **`scripts/security/refresh-breached-passwords.ts`** — Same pattern; passes `undefined` for `name` because its "exactly one runner" guarantee lives in its own `withLease` document rather than the shared lease table.
- **`tests/unit/scripts/run-script.test.ts`** — Unit tests exercising the success, failure, cleanup-failure, and config-refusal paths.

## Notes

- `process.exitCode` is used instead of `process.exit()` specifically so Node can flush stdout and drain pending handles before the process terminates. Using `process.exit()` would truncate in-flight log writes.
- The config import is **lazy** (`import('../src/app/config')`) so that a script that fails validation never loads (or side-effects) the modules it would have used.
- A cleanup failure is intentionally a **warning**, not an error: if the work already succeeded, a failed `quit()` on an already-dead socket must not flip the exit code to non-zero.
- `reap:inactive-accounts` is the one caller that bypasses `recordJobOutcome` here and records its outcome through its own lease document instead.
