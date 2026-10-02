---
source: scripts/run-script.ts
sha256: a6ef23abc326ba1990429a79eb2a068c99e98f5119e0b84e48edaeab64002dd2
generated_at: 2026-10-01T12:38:10.511545+00:00
model: ollama:qwen3.8:27b
---

# scripts/run-script.ts

## Purpose

Entry-point wrapper for every one-shot script under `scripts/db/` and `scripts/ops/`. It guarantees four things a bare promise chain does not: a deterministic non-zero exit code on failure, connection cleanup on the failure path, a structured error log, and a job-outcome record visible to `GET /observability/health` and `job_last_success_timestamp_seconds`.

## Key elements

- **`runScript`** (exported) — The single function every script calls. Lazily imports `src/app/config`, calls `assertProcessConfig()`, then delegates to either `runChecked` (config OK) or `refuseToRun` (config invalid). Always resolves; failure is signalled via `process.exitCode` only.
- **`runChecked`** (module-private) — `try { main() } catch { … } finally { cleanup() }`. Records a successful or failed job outcome via `recordJobOutcome` when a job name is provided. A cleanup failure is logged as a warning but does **not** alter the exit code.
- **`refuseToRun`** (module-private) — Called when `assertProcessConfig` throws. Logs the validation error, sets `exitCode = 1`, runs the caller's cleanup, and records **no** job outcome (the job never ran; the DB it would need may be misconfigured).

## Relationships

- **`scripts/db/bootstrap-access.ts`, `scripts/db/cache-clear.ts`, `scripts/db/grant-access.ts`, `scripts/db/sync-indexes.ts`** and **all `scripts/ops/*` reap/sweep/clean scripts** are direct consumers: each calls `runScript(name, main, cleanup)` as its sole entry point.
- **`scenarios/apply.ts`** — graph neighbour; also invokes `runScript` (or depends on the same config/assertion path) as part of the apply workflow.
- **`@infrastructure/persistence/lease`** (`recordJobOutcome`) — called on both success and failure paths to stamp the job's last-run timestamp in the lease document.
- **`src/app/config`** (`assertProcessConfig`) — dynamically imported before `main` runs so a misconfigured environment fails fast without loading the script's dependencies.
- **`@infrastructure/adapters/logger`** — all error/warn output in this file goes through the shared logger.

## Notes

- Uses `process.exitCode = 1` rather than `process.exit()` so Node can drain stdout and finish pending handles before the process actually exits.
- `reap:inactive-accounts` is the one script that passes `undefined` as the job name; it records its outcome through its own `withLease` document instead.
- `db:cache:clear` passes `undefined` for the same reason it has no scheduled interval *and* because it never opens a Mongo connection, so a lease row could not be written.
- The `cleanup` parameter is required (no default). Every script here opens a connection; a silent no-op default would let one of them quietly stop closing it.
- Config validation uses a dynamic `import()` so a script whose environment is invalid never loads its `main` body.
