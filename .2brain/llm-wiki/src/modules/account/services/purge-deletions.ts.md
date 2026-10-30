---
source: src/modules/account/services/purge-deletions.ts
sha256: 43692460f00a333164fc31f6380a98f58b916b18b24b1a225266afb8cef2e392
generated_at: 2026-10-29T02:43:23.617080+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/purge-deletions.ts

## Purpose

Permanently erases every account whose self-deletion grace period has expired. This is the step that discharges GDPR Art. 17 (the right to erasure); the earlier lock at deletion-request time is only a restriction. Triggered hourly by the `reap:scheduled-deletions` job.

## Key elements

- **`PurgeCounts`** (exported interface) — Per-run tally: `purged`, `skipped` (restored between read and erase), and `failed` (threw; stays due for next run).
- **`purgeScheduledDeletions()`** (exported) — Public entry point. Queries due accounts, iterates them **sequentially** through `purgeOne`, and returns a `PurgeCounts`. The caller is responsible for registering erase hooks, booting translations, and holding the job lease.
- **`purgeOne(user)`** (module-private) — Erases a single account via `userService.eraseScheduledDeletion`, then (on success) records an audit entry, increments the `authAccountDeleteTotal` metric, and fires-and-forgets a goodbye email. Returns `'purged' | 'skipped' | 'failed'`.

## Relationships

- **`@modules/users` (userService, UserDocument)** — Queries due deletions (`findDueScheduledDeletions`) and performs the actual erase (`eraseScheduledDeletion`).
- **`@kernel/permissions` (systemCallerContext)** — Builds the system-level caller context passed to the erase and audit calls.
- **`@infrastructure/observability/audit` (recordAudit)** — Writes the `AUTH_ACCOUNT_DELETE_COMPLETED` audit event after a successful erase.
- **`../audit` (accountAuditActions)** — Source of the audit action identifier.
- **`../emails` (accountDeletedEmail, greetableName, recipientLocale)** — Constructs the locale-aware goodbye email content.
- **`../metrics` (authAccountDeleteTotal)** — Prometheus-style counter, incremented with `status: 'purged'` or `'failure'`.
- **`./mail` (sendAccountMail)** — Enqueues the goodbye email (fire-and-forget; never rejects).
- **`@infrastructure/adapters/logger`** — Structured error log on failure; info summary after a full run.
- **`src/modules/account/jobs.ts`** — The `reap:scheduled-deletions` job invokes `purgeScheduledDeletions`.
- **`src/modules/account/services/index.ts`** — Barrel re-export for the services sub-package.

## Notes

- **Sequential, not concurrent.** Accounts are erased one at a time in a `for` loop so a single failure never aborts the batch and ordering stays deterministic.
- **App clock, not DB clock.** `findDueScheduledDeletions(new Date())` deliberately passes the application's clock; the demo clock advances only app time, not the database's.
- **Fire-and-forget email.** `sendAccountMail` is called with `void` and a `normal` priority; it never rejects (internal enqueue logs its own errors), hence the eslint suppression.
- **`skipped` is a race, not a bug.** It means a restore landed between the due-read and the erase attempt; the account is fine.
- **Caller contract.** This function does *not* register per-module erase hooks, boot i18n, or acquire the job lease — the calling job does all three before invoking it.
