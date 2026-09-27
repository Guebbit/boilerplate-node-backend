---
source: scripts/run-script.ts
sha256: 1173a0f3b83394dbe0e1422d1e6577c4f6930c64048bc4f2dc9d284295c48449
generated_at: 2026-09-27T13:59:59.967550+00:00
model: ollama:qwen3.8:27b
---

# scripts/run-script.ts

## Purpose

Single-purpose wrapper that every one-shot script in `scripts/db/` and `scripts/ops/` (and `scenarios/apply.ts`) calls to execute its body. It provides four things a bare `async` body lacks: a guaranteed non-zero `process.exitCode` on failure, a `finally`-guaranteed cleanup of open Mongo/Redis handles, a structured error log entry, and a `recordJobOutcome` write that the `GET /observability/health` endpoint and `job_last_success_timestamp_seconds` metric consume.

## Key elements

- **`runScript(name, main, cleanup)`** — The sole export. Runs `main()`, records success/failure via `recordJobOutcome` (only when `name` is provided), sets `process.exitCode = 1` on throw, logs the error, then **always** awaits `cleanup()` in a `finally` block. The promise always resolves; callers do not attach `.catch`.
  - `name: string | undefined` — the npm-script identifier (e.g. `reap:orders`) used as the job key in observability. `undefined` for one-off `db:*`/`access:*` scripts that have no scheduled interval.
  - `main: () => Promise<void>` — the script's actual work.
  - `cleanup: () => Promise<unknown>` — required (not defaulted) callback to close connections. A cleanup throw is logged as a warning but does **not** alter `exitCode`.

## Relationships

- **All `scripts/ops/*` neighbors** (`reap-inactive-accounts`, `reap-invoices`, `reap-mail-spool`, `reap-orders`, `reap-payments`, `reap-quarantine`, `refresh-breached-passwords`, `sweep-order-effects`, `sweep-payment-effects`, `sweep-reservations`) import `runScript` and pass their own npm-script name as `name`, so each scheduled crontab entry is individually visible in the health endpoint and Prometheus metric.
- **`scripts/db/bootstrap-access.ts`, `scripts/db/grant-access.ts`, `scripts/db/sync-indexes.ts`, `scripts/db/cache-clear.ts`** import `runScript` and pass `name = undefined` because they are one-off setup/migration scripts with no alerting interval.
- **`scenarios/apply.ts`** imports `runScript` for the same wrapper behavior in its apply workflow.
- **`scripts/ops/reap-inactive-accounts.ts`** is explicitly the exception noted in the source: it passes `name = undefined` and records its outcome through its own `withLease` document rather than through `recordJobOutcome`, because its "exactly one runner" guarantee lives in that lease.
- **Upstream imports:** `@infrastructure/adapters/logger` (structured logging) and `@infrastructure/persistence/lease` (`recordJobOutcome`).

## Notes

- Uses `process.exitCode = 1` deliberately instead of `process.exit(1)` so Node can flush stdout and close pending sockets before the process actually exits; `exit()` would truncate in-flight log writes.
- `cleanup` is a required parameter with no default — the comment explains this is intentional to prevent a future script from silently skipping connection teardown.
- A failure inside `cleanup` (e.g. calling `quit()` on an already-closed socket) is logged at `warn` level and does **not** set `exitCode`, so a successful run is not marked red by a no-op teardown error.
- Every crontab line in `docker/crontab` routes through this function; the `name` string must match the npm-script key used in the crontab for the metric label to line up.
