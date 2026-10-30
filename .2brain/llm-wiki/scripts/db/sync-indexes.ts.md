---
source: scripts/db/sync-indexes.ts
sha256: ba03bd1fe329af8ad2b9a9741ef266471f0d9c54eb705e3c7888c80bf39f0ed8
generated_at: 2026-10-29T01:33:03.936930+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/sync-indexes.ts

## Purpose

Reconciles the database's live indexes with what Mongoose schemas declare. It is the "schema half" of migrations: idempotent, add-only by default (never drops an undeclared index by surprise), and safe to run on every boot and every deploy. Serves as a deploy gate via `--check` (exit 1 if indexes would change).

## Key elements

- **`checkOnly` / `prune`** — module-level booleans read from CLI flags (`--check`, `--prune`) via `hasFlag`.
- **`describe(diff: IndexDiff): string`** — renders one collection's pending index changes as human-readable `+`/`~`/`-`/`=` lines.
- **`report(plan, heading)`** — logs the plan, or a "nothing to do" message when the plan is empty.
- **`sync(): Promise<void>`** — core logic. Disables `mongoose.autoIndex`, connects via `startJob`, then either prints the plan (`--check`) or applies it (`applyIndexSync`). On `--check`, sets `process.exitCode = 1` if any diff has real changes (without throwing).
- **`runScript(undefined, sync, cleanup)`** — entry-point call; `undefined` opts out of job-health metric tracking. `runScript` owns the connection-close and never rejects.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/cli.ts` | Imports `hasFlag` to parse `--check` / `--prune` from process args. |
| `scripts/db/index-sync.ts` | Imports `planIndexSync`, `applyIndexSync`, `hasChanges`, and the `IndexDiff` type — the actual diff/apply engine. |
| `scripts/run-script.ts` | Imports `runScript` as the script lifecycle wrapper (start → run → cleanup → exit-code handling). |
| `src/infrastructure/adapters/logger.ts` | Imports `logger` for all console output. |
| `src/infrastructure/config/dotenv.ts` | Side-effect import; loads `.env` before anything else. |
| `src/infrastructure/runtime/database.ts` | Imports `startJob` (connection + job lifecycle) and `connection` (for close on exit). |
| `src/infrastructure/runtime/mongoose-boot.ts` | Side-effect import; sets Mongoose defaults that are read at schema-build time. Must load before any model. |

## Notes

- **`autoIndex` is force-disabled** (`mongoose.set('autoIndex', false)`). With it on, Mongoose would create indexes on connect, making `--check` write to the DB and racing the explicit reconciliation on the apply path.
- **Add-only is the default.** An index no schema declares is kept and reported as `= undeclared, kept`. Only two things are dropped unconditionally: an index whose options changed (replaced) and a name a model explicitly listed as retired. `--prune` is the only way to drop all undeclared indexes and is intended for dev, never deploy.
- **`--check` exit code is set, not thrown.** `process.exitCode = 1` is assigned directly so the informational plan doesn't produce a stack trace. `runScript` handles the actual process exit.
- **Import order is load-bearing:** `dotenv` and `mongoose-boot` are imported before `mongoose` itself and any model, because Mongoose reads defaults at schema-construction time.
- **The `undefined` first arg to `runScript`** signals this is a deploy-time setup script, not a recurring cron job, so it is excluded from job-health alerting.
