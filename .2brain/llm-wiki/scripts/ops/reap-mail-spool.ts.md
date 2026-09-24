---
source: scripts/ops/reap-mail-spool.ts
sha256: 71b7b4381e84acdef322f09b0625d2f96f9495e08ed82cd0111367af96f870cc
generated_at: 2026-09-23T17:29:54.253097+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-mail-spool.ts

## Purpose

CLI backstop job (`npm run reap:mail-spool`) that deletes mail-spool files abandoned by a crashed or lost mail job. It is filesystem-only, idempotent, and designed to run as a periodic scheduled task (cron, container schedule) rather than interactively.

## Key elements

- **`retentionMs()`** — Reads `NODE_MAIL_SPOOL_RETENTION_HOURS` (default 1) via `environmentNumber` and returns the retention window in milliseconds.
- **`main()`** — Calls `reapSpooled(retentionMs())`, logs an info message only when `reaped > 0`.
- **Entry point** — `void runScript(main, () => Promise.resolve())` wires the script through the standard runner; the second argument is a no-op teardown (no DB or resources to release).

## Relationships

- **`src/infrastructure/adapters/mail-spool.ts`** — Source of `reapSpooled()`, the function that actually walks the spool directory and deletes files older than the retention window.
- **`src/infrastructure/runtime/environment.ts`** — Source of `environmentNumber()`, used to parse the retention-hours env var with a default.
- **`src/infrastructure/adapters/logger.ts`** — Source of `logger`; the script logs only a single info line when files are actually reaped.
- **`scripts/db/run-script.ts`** — Source of `runScript()`, the standard entry-point wrapper that handles signal handling and lifecycle for scripts in this repo.

## Notes

- Safe to run concurrently with live sends: `NODE_MAIL_SPOOL_PATH` is only ever read by `mailer.ts`, and the sweep only touches files older than the retention window (default 1 h), far beyond the seconds a mail job needs.
- A spooled file outliving its job means the mail job died between `spoolAttachment()` and the actual send — this script is the cleanup path for that failure mode.
- See `docs/tools/email-and-rendering.md` for the broader mail pipeline context.
