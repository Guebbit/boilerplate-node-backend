---
source: scripts/ops/reapply-erasures.ts
source_sha256: f2b48e58e5a9846b4337c7a17e463023e14a38a128cc5372a534fbd33af13956
context_sha256: 20c2b69fc2e17139661946d0aa94ccaf35fc9caef5538a22c214fc5148d99ccc
generated_at: 2026-11-22T02:11:33.862990+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/ops/reapply-erasures.ts

## Purpose
A manual operations script, run as `npm run ops:reapply-erasures -- --since <time>`, that erases again the accounts named in the erasure ledger after a restore of an older snapshot. A restore brings back accounts erased after the snapshot was taken. The ledger (`erasureledgers`) outlives the oldest backup, so it still knows them. It is run by a person, never on a schedule. It must run on the restored database with the app, worker, worker-heavy and cron stopped, before the stack starts. The ledger in that database must be the live one or the newest snapshot's, not the restored copy.

## Key elements
- `requiredSince()`: reads `--since` via `flagValue` and returns a `Date`. It throws a usage error if the flag is missing or unparseable, because guessing a date would replay the wrong window.
- `drainAuditSink(report)`: waits 1 second before resolving with the report. This lets the fire-and-forget restoration-log row reach Mongo before the connection closes. The synchronous audit log line is the authoritative record either way.
- `replay(since)`: registers `enabledModules`, calls `startJob()`, boots i18n from the modules' `locales` directories, then calls `reapplyErasures({ since, by, snapshot })` and `drainAuditSink`.
- `main()`: validates `--since`, runs `replay`, and logs the headline counts (`countsOf`) and the full report by outcome. It sets `process.exitCode = 1` if `report.failed` is non-empty.
- Entry point: `runScript(undefined, main, () => Promise.all([stopDatabase(), stopQueue()]))`. There is no job name.

Flags:
- `--since <ISO time>` (required): the snapshot's time. Ledger rows from then on are replayed.
- `--snapshot <id>`: the restic snapshot restored, for the restoration log.
- `--by <name>`: who restored, for the restoration log. Defaults to the OS user.

## Relationships
- `scripts/run-script.ts`: `runScript` wraps `main` and runs the cleanup callback. It never rejects, and failures are reported through the exit code.
- `scripts/cli.ts`: supplies `flagValue` for `since`, `by` and `snapshot`.
- `src/modules/account/services/erasure-ledger.ts`: supplies `reapplyErasures`, `countsOf` and the `ReapplyReport` type. This is where the actual replay logic lives.
- `src/kernel/registry.ts` and `src/modules.ts`: `registerModules(enabledModules)` registers the modules so each module's erase hook runs, as in the scheduled purge. `enabledModuleDirectories('locales')` supplies the i18n directories.
- `src/infrastructure/runtime/database.ts`: `startJob` connects, and `stopDatabase` closes the connection at the end.
- `src/infrastructure/adapters/queue.ts`: `stopQueue` is called at shutdown.
- `src/infrastructure/i18n` (`index.ts`, `boot.ts`): `bootI18n` is imported from `@infrastructure/i18n`, the i18n index module.
- `src/infrastructure/adapters/logger.ts`: logs the results.
- `src/infrastructure/config/dotenv.ts` and `src/infrastructure/runtime/mongoose-boot.ts`: side-effect imports that load env config and set Mongoose defaults.

## Notes
- Import order matters. `mongoose-boot` must load before any model because Mongoose defaults are read at schema build.
- The script is safe to repeat. An account already erased is skipped, and a failed one is retried by running again.
- The exception is the final sweep. After the outbox settles, it deletes held jobs that name an erased account's address. This is needed because step 4 re-sends restored outbox rows, which can hold a new job for an erased address. The sweep needs the addresses of accounts erased in this run. If it throws, the account is listed under `failed` and the exit code is non-zero. The fix is to restore again and rerun, since the restored accounts bring their addresses back.
- Every account id is logged under "Accounts by outcome" because the audit log lost the rows written after the snapshot.
- The script exits non-zero when any account could not be erased.
- The file's header comment points to a backups doc for the restore procedure.
