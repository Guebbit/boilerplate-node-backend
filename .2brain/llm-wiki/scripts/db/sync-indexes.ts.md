---
source: scripts/db/sync-indexes.ts
source_sha256: 5693eefbf44505b733549ecb3ab425d742a73b85ef56ba4bfb198218773953ba
context_sha256: 3b981801bb939e19070240b21c843e87cabac185c3333dcf1cfa59d8d6d0e210
generated_at: 2026-11-22T02:01:24.074797+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/db/sync-indexes.ts

## Purpose
CLI script behind `npm run db:sync`. It reconciles the database's indexes with those declared on each module's `model.ts`. It is idempotent, so it can run on every boot or deploy. By default it only adds indexes and never drops them unexpectedly, so an older release run after a rollback cannot delete a newer release's indexes.

## Key elements
- `checkOnly` — set by the `--check` flag. Prints the plan, changes nothing, and sets exit code 1 if applying would change something.
- `prune` — set by the `--prune` flag. Also drops every undeclared index. A deploy never passes it.
- `describe(diff)` — formats one collection's `IndexDiff` as one line per index:
  - `+ create`
  - `~ replace`
  - `- drop retired`
  - `- drop undeclared`
  - `= undeclared, kept`
- `report(plan, heading)` — logs the formatted plan, or "nothing to do" when the plan is empty.
- `sync()` — the job body:
  1. Disables Mongoose `autoIndex`.
  2. Connects via `startJob()`.
  3. In check mode, calls `planIndexSync` and reports the result. It sets `process.exitCode = 1` if any diff `hasChanges`.
  4. Otherwise it calls `applyIndexSync` and reports the result.
- The last line runs `runScript(undefined, sync, () => connection.close())`.

## Relationships
- `./index-sync` supplies `planIndexSync`, `applyIndexSync`, `hasChanges` and the `IndexDiff` type. This file does the CLI handling and reporting, and `index-sync` does the planning and applying.
- `../cli` supplies `hasFlag`, used to read `--check` and `--prune`.
- `../run-script` supplies `runScript`, which wraps the job. It owns failure handling and the exit code, and the cleanup callback closes the DB connection.
- `@infrastructure/runtime/database` supplies `startJob` (connect) and `connection` (closed on cleanup).
- `@infrastructure/runtime/mongoose-boot` is imported for its side effects and must load before any model, because Mongoose defaults are read when a schema is built.
- `@infrastructure/config/dotenv` is imported for its side effects to load environment variables.
- `@infrastructure/adapters/logger` supplies `logger`, used for all output.

## Notes
- `autoIndex` is turned off deliberately. Otherwise `--check` would write indexes to the database it was only meant to inspect, and the apply path would race the reconciliation.
- Indexes whose options changed (replaced) and names a model listed as retired are dropped even without `--prune`. Other undeclared indexes are only reported as kept.
- Undeclared indexes that would be kept are not counted as a change for the `--check` exit code.
- `--check` sets `process.exitCode` directly instead of throwing, because a plan is an informative outcome and not a failure. That avoids printing a stack trace.
- Passing `undefined` as the first `runScript` argument means this is a deploy-time setup script and not a `docker/crontab` job. It takes no part in job-health or metric tracking.
- To run it against a containerised database from the host, use `npm run host -- db:sync`.
