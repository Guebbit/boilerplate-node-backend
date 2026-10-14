---
source: scripts/ops/reap-previous-emails.ts
sha256: 15fcc34973eadb56ab85a38af574072762694094c82e5badf08cc5b32d984e42
generated_at: 2026-10-14T07:25:52.977432+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-previous-emails.ts

## Purpose

Nightly batch job (`npm run reap:previous-emails`) that clears the `previousEmail` field on every account whose 7-day undo link has lapsed (expired, spent, or revoked). It lives here rather than inline because the cleanup is a single unindexed `updateMany` scan over all accounts holding a `previousEmail`—too expensive to run per-request.

## Key elements

- **`main()`** — Entry sequence: calls `startJob()` to connect Mongo, then runs `reapLapsedPreviousEmails` inside `withLease`, logging either a "skipped" or "reaped (count)" message.
- **`LEASE_TTL_MS`** — 30 minutes; how long a crashed lease holder blocks the next run.
- **`runScript(undefined, main, stopDatabase)`** — Bootstraps the script: runs `main`, guarantees `stopDatabase` on both success and failure paths. Passes `undefined` for the job name (see Notes).

## Relationships

- **`src/modules/account/index.ts`** — Re-exports `reapLapsedPreviousEmails`, the actual cleanup query this script delegates to.
- **`src/modules/account/services/previous-email-cleanup.ts`** — Implements the `updateMany` that removes lapsed `previousEmail` values.
- **`src/infrastructure/persistence/lease.ts`** — Provides `withLease`; guards the sweep so a concurrent runner is a no-op rather than a double-scan.
- **`scripts/run-script.ts`** — Provides `runScript`, the shared script wrapper (connection lifecycle + error handling).
- **`src/infrastructure/runtime/database.ts`** — `startJob` opens the Mongo connection; `stopDatabase` closes it on both paths.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Must load before any Mongoose model is imported so schema defaults are set at build time.
- **`src/infrastructure/config/dotenv.ts`** — Loaded first to populate environment variables before other modules read config.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging of the skip/success outcome.

## Notes

- **No job name is passed to `runScript`.** The lease itself records the outcome under the key `reap:previous-emails`. Passing a name would cause a skipped run (lease held by another instance) to be logged as a success.
- **Import order matters.** `dotenv` and `mongoose-boot` are side-effect imports that must resolve before `@modules/account` is loaded; reordering them can silently break schema defaults.
- **Owned by the `account` module.** If the feature is removed, delete this file *and* the `reap:previous-emails` npm script *and* its `docker/crontab` entry together.
- **Idempotent by design.** Re-running is harmless; the lease makes a second concurrent runner a logged no-op.
- **Not needed for sessions or one-time tokens.** Those rows carry TTL dates the database enforces automatically—only `previousEmail` requires explicit cleanup.
