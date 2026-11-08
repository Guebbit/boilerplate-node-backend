---
source: scripts/db/sync-indexes.ts
sha256: ba03bd1fe329af8ad2b9a9741ef266471f0d9c54eb705e3c7888c80bf39f0ed8
generated_at: 2026-11-08T02:46:07.112789+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/sync-indexes.ts

## Purpose

Entry-point script (`npm run db:sync`) that reconciles the database's live indexes with the indexes declared across all Mongoose models. Idempotent and add-only by default: it creates missing indexes and replaces changed ones, but keeps undeclared indexes unless explicitly told to prune. Serves as the "schema half" of schema management, run on every boot and deploy rather than as a one-time migration.

## Key elements

- **`sync`** (async, unexported) — Main logic. Disables `autoIndex`, connects via `startJob`, then either calls `planIndexSync` + `report` (check mode) or `applyIndexSync` + `report` (apply mode). In check mode, sets `process.exitCode = 1` if any diff has changes (usable as a deploy gate).
- **`describe`** — Formats a single `IndexDiff` into a multi-line, per-index report (`+ create`, `~ replace`, `- drop retired`, `- drop undeclared`, `= undeclared, kept`).
- **`report`** — Logs the plan under a heading, or logs "nothing to do" if the plan is empty.
- **`checkOnly` / `prune`** — Module-level booleans read once from CLI flags; gate the two optional behaviors.
- **`runScript(undefined, sync, cleanup)`** — Top-level invocation. The `undefined` first argument opts out of job-health/metric tracking (this is a deploy script, not a cron job).

## Relationships

- **`scripts/db/index-sync.ts`** — Supplies all reconciliation logic: `planIndexSync`, `applyIndexSync`, `hasChanges`, and the `IndexDiff` type. This file is purely the CLI/orchestration layer on top of that module.
- **`scripts/cli.ts`** — Provides `hasFlag` to read `--check` and `--prune` from `process.argv`.
- **`scripts/run-script.ts`** — Wraps execution: lifecycle, error reporting via `process.exitCode`, and the cleanup callback (`connection.close()`).
- **`src/infrastructure/runtime/database.ts`** — `startJob()` establishes the connection; `connection` is passed to the cleanup callback.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported before any model code so Mongoose defaults are set at schema-build time.
- **`src/infrastructure/config/dotenv.ts`** — Imported first to load environment variables before anything reads them.
- **`src/infrastructure/adapters/logger.ts`** — All user-facing output goes through `logger.info`.

## Notes

- **Import order is significant.** `dotenv` and `mongoose-boot` must appear before `mongoose` and any model import; Mongoose reads defaults at schema-construction time.
- **`autoIndex` is explicitly disabled.** Leaving it on would (a) make `--check` write to the database and (b) race the manual reconciliation on the apply path.
- **Add-only default is deliberate.** An index absent from all schemas is *kept and reported*, not dropped. This protects against an older release run after a rollback deleting a newer release's indexes. Only two cases drop without `--prune`: an index whose options changed (replaced) and a name a model listed as retired.
- **`--check` exit code is set directly, not via throw.** A non-empty plan is informative, not a failure; throwing would print a stack trace for an expected outcome. `runScript` handles the actual non-zero exit.
- **`--prune` is a dev-only flag.** Deploys are expected never to pass it.
