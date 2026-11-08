---
source: src/modules/account/services/purge-deletions.ts
sha256: 43692460f00a333164fc31f6380a98f58b916b18b24b1a225266afb8cef2e392
generated_at: 2026-11-08T04:21:32.556475+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/purge-deletions.ts

## Purpose

Permanently erases accounts whose self-deletion grace period has expired. This is the step that actually discharges GDPR Art. 17 — the lock placed at request time is only a restriction; the purge removes the data. Invoked hourly by the `reap:scheduled-deletions` job.

## Key elements

- **`PurgeCounts`** (exported interface) — tally of a single run: `purged`, `skipped` (restored between read and erase), `failed` (threw; retried next run).
- **`purgeOne`** (private) — erases one `UserDocument` via `userService.eraseScheduledDeletion`, then on success records an audit event, increments the `authAccountDeleteTotal` metric, and fires-and-forgets a goodbye email. On failure, increments the failure metric and logs.
- **`purgeScheduledDeletions`** (exported) — entry point. Fetches all due accounts (using app time, `new Date()`), iterates **sequentially** calling `purgeOne`, accumulates counts, logs a completion summary, and returns the `PurgeCounts`.

## Relationships

- **`@modules/users`** (`userService`, `UserDocument`) — `findDueScheduledDeletions` supplies the work queue; `eraseScheduledDeletion` performs the actual hard delete (with a restore-safe check that produces the `skipped` outcome).
- **`@kernel/permissions`** — `systemCallerContext('User')` builds the caller identity passed to the erasure and audit calls.
- **`@infrastructure/observability/audit`** — `recordAudit` logs the `AUTH_ACCOUNT_DELETE_COMPLETED` action after a successful erase.
- **`../audit`** — exports the `accountAuditActions` enum used above.
- **`../emails`** — `accountDeletedEmail`, `greetableName`, `recipientLocale` compose the one-time goodbye message.
- **`./mail`** — `sendAccountMail` enqueues that email (fire-and-forget; it never rejects).
- **`../metrics`** — `authAccountDeleteTotal` counter, labelled `purged` or `failure`.
- **`@infrastructure/adapters/logger`** — error log on individual failures; info log with final counts after the run.
- **`../jobs`** — the `reap:scheduled-deletions` job is the production caller and owns the lease, erase-hook registration, and translation boot.
- **`services/index.ts`** — barrel re-export so other modules can import this service.

## Notes

- **Sequential by design.** Accounts are erased one at a time in a `for` loop; a single failure is logged and counted without aborting the rest.
- **Pre-copy before delete.** `email`, `locale`, and a display `name` are captured from the document *before* `eraseScheduledDeletion`, because the document no longer exists afterward.
- **App time, not DB time.** Due-ness is judged with `new Date()` (the application clock), not a database timestamp — relevant for the demo clock.
- **Fire-and-forget email.** `sendAccountMail` is intentionally not awaited (`void`); it enqueues internally and logs its own failures. The eslint disable is deliberate.
- **Caller contract.** This module assumes all per-module erase hooks are registered, translations are booted, and a job lease is held. It does not manage any of that itself.
