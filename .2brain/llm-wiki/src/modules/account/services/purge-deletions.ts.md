---
source: src/modules/account/services/purge-deletions.ts
sha256: 18bcf92fbc08e70c08220e3ee37ff8aefce76949a0972dde46a0636c71f26d9f
generated_at: 2026-11-14T18:49:20.927293+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/purge-deletions.ts

## Purpose

Permanently erases accounts whose self-deletion grace period has expired. This is the step that actually discharges GDPR Art. 17; the earlier lock at deletion-request time is only a restriction. The `reap:scheduled-deletions` job invokes this function hourly.

## Key elements

- **`PurgeCounts`** (exported interface) — Tallies the outcome of one run: `purged`, `skipped` (a restore won the race), and `failed` (will be retried next run).
- **`purgeScheduledDeletions`** (exported) — Main entry point. Finds all due accounts, erases them sequentially, tallies outcomes into `PurgeCounts`, and logs a summary. Caller is responsible for registered erase hooks, booted translations, and the job lease.
- **`purgeOne`** (private) — Erases a single account. On success: records the audit event, increments the deletion metric, sends the goodbye email (fire-and-forget). On failure: increments the failure metric and logs. Returns the outcome key.

## Relationships

- **`src/modules/users/friends/account.ts`** — Provides `accountUserService`, the service used to find due deletions and perform the hard erase.
- **`src/modules/users/index.ts`** — Source of the `UserDocument` type used as the input to the erase.
- **`src/kernel/permissions.ts`** — Supplies the system caller identity passed to the erase and audit calls.
- **`src/infrastructure/observability/audit.ts`** — Provides the audit-recording function invoked after a successful erase.
- **`src/modules/account/audit.ts`** — Defines the audit action constants referenced in the record.
- **`src/modules/account/metrics.ts`** — Defines the deletion counter incremented on each outcome.
- **`src/modules/account/emails.ts`** — Provides name formatting, locale resolution, and the post-deletion email template.
- **`src/modules/account/services/mail.ts`** — Delivers the goodbye email at normal priority.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging for per-account failures and the run summary.
- **`src/modules/account/jobs.ts`** — The scheduled job that owns the lease and calls into this module.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this module's public API.

## Notes

- **Capture-before-delete pattern:** `email`, `locale`, and `name` are read from the document *before* the erase call, because the document no longer exists afterward. Any code that needs post-delete data must copy it up front.
- **App time, not DB time:** `new Date()` is passed to the due-deletion query deliberately. In the demo environment only the application clock advances; the database clock is irrelevant.
- **Sequential, fault-tolerant loop:** Accounts are processed one at a time with `for…of`. A single failure is counted and logged but does not abort the remaining accounts.
- **Preconditions are the caller's:** All module-level erase hooks must be registered and i18n translations must be booted before calling `purgeScheduledDeletions`. This file does not check for either.
- **Goodbye email is best-effort:** The `void` + eslint-disable comment makes explicit that the mail send never rejects; a failure is logged internally by the mail pipeline and does not affect the purge result.
