---
source: scripts/db/run-script.ts
sha256: 496b9e039723e2400b7abc89634711cb7a0aea36bdcdc97d0f217580dd9ad1ed
generated_at: 2026-09-23T17:24:14.787604+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/run-script.ts

## Purpose

Shared entry-point wrapper for the one-shot scripts under `db/` and `ops/`. It guarantees three things a bare promise chain would not: a non-zero exit code on failure (so CI and shell `&&` chains react), guaranteed cleanup of open Mongo/Redis handles even when the script body throws, and a structured error log via the project logger.

## Key elements

- **`runScript(main, cleanup)`** (exported const, async) — Runs `main()`, catches any throw to log the error and set `process.exitCode = 1`, then always runs `cleanup()` in a `finally` block. Both parameters are required (no default for `cleanup` to prevent a silent no-op). Always resolves; callers do not need their own `.catch`. A cleanup failure is logged as a warning but does not alter the already-set exit code.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports the shared `logger` to emit the "Script failed." error log and the "Script cleanup failed." warning log.
- **`scripts/db/bootstrap-access.ts`, `scripts/db/cache-clear.ts`, `scripts/db/grant-access.ts`, `scripts/db/sync-indexes.ts`** — Caller scripts that pass their work and connection-closing logic into `runScript`.
- **`scripts/ops/reap-inactive-accounts.ts`, `scripts/ops/reap-invoices.ts`, `scripts/ops/reap-mail-spool.ts`, `scripts/ops/reap-orders.ts`, `scripts/ops/reap-payments.ts`, `scripts/ops/reap-quarantine.ts`, `scripts/ops/refresh-breached-passwords.ts`, `scripts/ops/sweep-order-effects.ts`, `scripts/ops/sweep-webhook-retries.ts`** — Ops-batch caller scripts using the same wrapper.
- **`scenarios/apply.ts`** — Also a caller in the dependency graph.

## Notes

- Uses `process.exitCode = 1` rather than `process.exit(1)` deliberately: setting the code lets Node flush stdout and drain pending handles; `exit()` can truncate in-flight log writes.
- `cleanup` is intentionally required (not defaulted). The JSDoc notes that a silent no-op default is how a script could quietly stop closing its connection.
- A cleanup failure is treated as a _warning_, not a failure: if the main work already succeeded, a failed `quit()` on a dead socket must not flip the run to red.
