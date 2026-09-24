---
source: scripts/db/sync-indexes.ts
sha256: 2444b245e23da8070cc07775b4281c1d90db8ac184f8534195eaef5cd6e561e6
generated_at: 2026-09-23T17:24:25.546868+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/sync-indexes.ts

## Purpose

CLI script (`npm run db:sync`) that reconciles the database's indexes with those declared in each module's `model.ts`. It creates missing indexes, **drops** indexes no schema declares (treating undeclared indexes as drift), and supports a `--check` mode that prints the plan and exits non-zero without writing. Idempotent by design — intended to run on every boot and deploy.

## Key elements

- **`checkOnly`** — module-level boolean, true when `--check` is present in `process.argv`.
- **`describe(diff: IndexDiff): string`** — formats one collection's pending changes as `+ key` / `- name` lines.
- **`report(plan, heading)`** — logs the plan via `logger.info`, or a "nothing to do" message when the plan is empty.
- **`sync(): Promise<void>`** — main routine: disables Mongoose `autoIndex`, calls `start()`, then either reports the plan (check mode, setting `process.exitCode = 1` on drift) or calls `applyIndexSync()`.
- The file is a **script entry point** (no exports); it delegates execution to `runScript(sync, cleanup)`.

## Relationships

- **`scripts/db/index-sync.ts`** — supplies `planIndexSync`, `applyIndexSync`, and the `IndexDiff` type used throughout.
- **`scripts/db/run-script.ts`** — wraps `sync` with connection teardown (`connection.close()`) and owns the process exit code on the failure path.
- **`src/infrastructure/runtime/database.ts`** — provides `start()` (opens the connection) and `connection` (hand-off for cleanup).
- **`src/infrastructure/adapters/logger.ts`** — provides the structured `logger` used for all user-facing output.

## Notes

- `mongoose.set('autoIndex', false)` is called **before** connecting. Without it Mongoose would create declared indexes on connect, breaking `--check` (it would write) and racing the explicit reconciliation on the apply path.
- In `--check` mode, a non-empty plan sets `process.exitCode = 1` directly rather than throwing, so the output is a clean plan with no stack trace. This makes the command usable as a CI / deploy gate.
- The script intentionally **drops** indexes absent from any schema. Run `--check` first against any database that cannot be rebuilt.
- No indexes are declared outside `model.ts` files; this script is the single source of truth for reconciliation.
