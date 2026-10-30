---
source: src/modules/account/jobs.ts
sha256: 1d31f8184e380c1ca889373914ff93dc3ce19e77cde65bc051125e1fb94cea40
generated_at: 2026-10-29T02:34:44.277587+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/jobs.ts

## Purpose

Defines the scheduled jobs owned by the `account` module: inactive-account reaping, previous-email cleanup, expired-export reaping, and purge of accounts past their self-deletion grace period. Each service call is wrapped into a `JobDeclaration` (schedule metadata from the generated file + a `run` function + optional runtime requirements) and exported as a single array for the kernel to register.

## Key elements

- **`accountJobs`** (exported) — `readonly JobDeclaration[]`, the four jobs in execution order: `reapInactiveAccounts`, `reapPreviousEmails`, `reapAccountExports`, `reapScheduledDeletions`.
- **`reapInactive`** (local) — thin wrapper that reads `NODE_INACTIVE_ACCOUNT_DAYS` / `NODE_INACTIVE_MINIMISE_DAYS` from config and short-circuits to a zeroed `InactiveReapCounts` when both are `0`, otherwise delegates to `reapInactiveAccounts`.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `JobDeclaration` type that shapes every entry in `accountJobs`.
- **`src/modules/account/jobs.generated.ts`** — provides `accountJobData` (name, schedule, etc.) spread into each declaration; this file only adds `run`, `needs`, and `lease`.
- **`src/modules/account/config.ts`** — `accountConfig()` is called to read the two inactive-day thresholds.
- **`src/modules/account/services/reap-inactive.ts`** — `reapInactiveAccounts` is the actual work; `InactiveReapCounts` is the return type.
- **`src/modules/account/services/previous-email-cleanup.ts`** — `reapLapsedPreviousEmails` runs the email sweep.
- **`src/modules/account/services/export-rows.ts`** — `reapExpiredExports` removes stale export rows/files.
- **`src/modules/account/services/purge-deletions.ts`** — `purgeScheduledDeletions` performs the final hard-delete after grace period.
- **`src/infrastructure/adapters/logger.ts`** — `logger` is used for structured info logs in the email and export jobs.
- **`src/modules/account/module.ts`** — consumes `accountJobs` to register the module's schedule with the kernel.
- **`src/modules/account/tests/integration/jobs.test.ts`** — integration-tests the job wiring in this file.

## Notes

- Jobs that **hard-delete** accounts (`reapInactive`, `reapScheduledDeletions`) declare a 15-minute `lease` and `needs: { subscriptions, i18n }`; the email/export jobs carry no `needs` and the email job has a longer 30-minute lease.
- `reapInactive` is the only job that reads from `accountConfig` at call time; the others rely entirely on defaults inside their services.
- The spread of `accountJobData.<key>` means schedule/cron metadata lives in the generated file — changing cadence means editing `jobs.generated.ts`, not this file.
