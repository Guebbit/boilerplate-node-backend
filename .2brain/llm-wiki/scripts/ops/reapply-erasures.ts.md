---
source: scripts/ops/reapply-erasures.ts
sha256: e3de953dd27f9e4fde78fcca6282193224564acb395b33775dfabeb51b6a3474
generated_at: 2026-11-08T02:55:27.950373+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reapply-erasures.ts

## Purpose

Operational script that replays the erasure ledger after a database restore. Restoring an older snapshot resurrects accounts that were erased after that snapshot; this script re-erases them using the ledger (which outlives the oldest backup). It is run manually by an operator—never on a schedule—with the app and cron stopped.

## Key elements

- **`requiredSince()`** — Parses and validates the mandatory `--since <ISO time>` flag; throws a usage error if missing or unparseable (no guessing a window).
- **`drainAuditSink(report)`** — Waits 1 s via `setTimeout` so the fire-and-forget audit-sink write can reach Mongo before the connection closes. Resolves the same report.
- **`replay(since)`** — Orchestrates the run: registers modules (so every module's erase hook fires), starts the DB job, boots i18n, calls `reapplyErasures`, settles outbox nudges, then drains the audit sink.
- **`main()`** — Top-level: validates the guard, invokes `replay`, logs structured counts via `logger`, and sets `process.exitCode = 1` if any erasure failed.
- **Entry point** — `runScript(undefined, main, cleanup)` with no job name (manual invocation). Cleanup stops the database and queue.

## Relationships

- **`scripts/cli.ts`** — `flagValue` reads the `--since`, `--snapshot`, and `--by` CLI flags.
- **`scripts/run-script.ts`** — `runScript` wraps the entry point with lifecycle management and the provided cleanup callback.
- **`src/modules/account/services/erasure-ledger.ts`** — Core logic: `reapplyErasures` performs the replay, `countsOf` formats the summary, `ReapplyReport` is the result type.
- **`src/kernel/registry.ts`** — `registerModules` is called so the full erasure cascade (all module hooks) executes, matching the scheduled purge path.
- **`src/modules.ts`** — Supplies `enabledModules` (for registration) and `enabledModuleDirectories('locales')` (for i18n boot).
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` finalises outbox side-effects after the replay.
- **`src/infrastructure/runtime/database.ts`** — `startJob` opens the DB; `stopDatabase` is called in cleanup.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue` is called in cleanup.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import; must load before any Mongoose schema is built.
- **`src/infrastructure/i18n/boot.ts`** — `bootI18n` loads locale files for the enabled modules.
- **`src/infrastructure/adapters/logger.ts`** — `logger` writes the structured result lines.
- **`src/infrastructure/config/dotenv.ts`** — Side-effect import to load environment variables first.

## Notes

- **Import order is significant**: `dotenv` and `mongoose-boot` are side-effect imports that must precede any model/schema loading.
- **Run constraints** (from the header doc): app and cron must be **stopped**; the ledger in the target database must be the live one or the newest snapshot's, **not** the restored copy. See `docs/tools/backups.md#erasures-after-a-restore`.
- **Idempotent / safe to repeat**: already-erased accounts are skipped; partial failures are retried by re-running.
- **`drainAuditSink` is a timing hack**: the audit sink is fire-and-forget by contract and returns nothing to await, so a 1 s `setTimeout` is the only way to give it a chance before the connection drops. The synchronous audit-log line is the authoritative record regardless.
- **No scheduled job name** is passed to `runScript`—this distinguishes it from periodic scripts and signals it is a one-off operator action.
