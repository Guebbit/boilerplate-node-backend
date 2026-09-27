---
source: scripts/db/sync-indexes.ts
sha256: 79fc9a48dcad846feb56c2f3e3d5574081bb0160ff25a0b55c59bf4c78c39ee9
generated_at: 2026-09-27T13:54:21.308093+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/sync-indexes.ts

## Purpose

Reconciles the live database's indexes with those declared in each module's `model.ts`. Idempotent — safe to run on every boot and deploy. It both creates missing indexes and **drops** any index not declared in a schema (treated as drift). Serves as the project's replacement for a migration tool's index half.

## Key elements

- **`checkOnly`** — Boolean flag derived from `--check` in `process.argv`; switches the script from apply to dry-run.
- **`describe(diff)`** — Formats a single `IndexDiff` (collection + `toCreate` / `toDrop` arrays) as indented `+` / `-` lines.
- **`report(plan, heading)`** — Logs the full plan via `logger`, or a "nothing to do" message when the plan is empty.
- **`sync()`** — Main entry: disables `mongoose.autoIndex`, opens a connection, then either calls `planIndexSync` + `report` (check mode) or `applyIndexSync` + `report` (apply mode). In check mode, sets `process.exitCode = 1` when drift is found.
- **`void runScript(undefined, sync, …)`** — Wires `sync` into the shared script-runner lifecycle; the `undefined` first argument opts out of D9 job-health tracking.

## Relationships

- **`scripts/db/index-sync.ts`** — Provides `applyIndexSync` (execute changes), `planIndexSync` (compute changes), and the `IndexDiff` type. All index-reading/writing logic lives there; this file is the CLI wrapper.
- **`scripts/run-script.ts`** — Provides `runScript`, which manages process exit codes, structured error output, and the post-script cleanup callback (here, `connection.close()`).
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` used for all user-facing output (plans, success, "nothing to do").
- **`src/infrastructure/runtime/database.ts`** — Provides `start()` (opens the Mongoose connection) and `connection` (passed to the cleanup callback so the socket is closed after the script finishes).

## Notes

- `mongoose.set('autoIndex', false)` is called **before** connecting. Without it, Mongoose would create declared indexes on connect, making `--check` write to the DB and racing the explicit reconciliation on the apply path.
- In `--check` mode, a non-empty plan sets `process.exitCode = 1` directly (not via `throw`), so CI/deploy gates get a clean non-zero exit without a stack trace for an expected, informative outcome.
- Passing `undefined` to `runScript` is intentional: this is a deploy-time setup script, not a recurring crontab job, so it should not participate in D9 job-health alerting (see `docs/reference/ops.md`).
- Indexes are declared exclusively in each module's `model.ts`; there is no central index manifest. Any index in the DB not matching those declarations is considered drift and will be dropped on the next apply.
