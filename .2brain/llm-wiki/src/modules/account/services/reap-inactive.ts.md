---
source: src/modules/account/services/reap-inactive.ts
source_sha256: 8b5bff6f59939c1dada2ee8c98a2f5761f3db8d8a7c74d73e4f0bd62087a166d
context_sha256: a5f7889656a263ca3574b137e98b989ec6cb245e7faa30fb558927133ca0aa2e
generated_at: 2026-11-22T03:40:43.481165+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/reap-inactive.ts

## Purpose
Implements the inactivity reaper's stages as a callable service, separate from the cron script that invokes it, so the stage order can be tested. It minimises long-idle accounts' personal data and, optionally, walks them through warn, soft delete and hard delete.

## Key elements
- `reapInactiveAccounts({ inactiveDays, minimiseDays })` — the only export. Runs stage 0 (minimise), then stages 1–3 (deletion path), and returns `InactiveReapCounts`.
  - `minimiseDays > 0` enables stage 0, which runs even when deletion is off.
  - `inactiveDays > 0` enables the deletion path.
  - A dial set to `0` switches off its own stages, and their counts are `0`.
- `InactiveReapCounts` — exported interface with `minimised`, `warned`, `softDeleted` and `hardDeleted` counts.
- `GRACE_DAYS` (30) — fixed pause between the warning and the soft delete, and between the soft delete and the hard delete. It is not configurable.
- `minimiseStage` — calls `accountUserService.minimiseInactiveBefore(daysAgo(minimiseDays))`, logs the result and returns `result.minimised`.
- `deletionStages` — runs these steps in order:
  1. Warn every user returned by `findInactiveUnwarned`.
  2. Soft delete users from `findWarnedStillInactive(daysAgo(GRACE_DAYS))` via `softDeleteInactive`.
  3. Hard delete users from `findReaperSoftDeletedPastGrace` via `eraseInactive`.
- `warn` — builds the warning email with `inactivityWarningEmail`, enqueues it, then calls `markInactivityWarned` so the account is not warned twice.
- `daysAgo` — returns the date `days` days before now, using `DAY_MS`.

## Relationships
- `src/modules/users/friends/account.ts` — `accountUserService` supplies all the finders and mutations: minimise, find, mark warned, soft delete and erase.
- `src/modules/account/emails.ts` — supplies `inactivityWarningEmail` and `greetableName`.
- `src/infrastructure/adapters/mailer.ts` — `enqueueEmail` sends the warning.
- `src/infrastructure/i18n/index.ts` — `getDefaultLocale` is the fallback locale when a user has none set.
- `src/kernel/permissions.ts` — `systemCallerContext('User')` is passed to the soft and hard deletes.
- `src/infrastructure/adapters/logger.ts` — stage summaries and warnings.
- `src/domain-primitives/time.ts` — `DAY_MS`.
- `src/modules/users/index.ts` — the `UserDocument` type.
- `src/modules/account/jobs.ts` — the cron script that runs the reaper lives there; it is not imported here.
- `src/modules/account/tests/integration/reap-inactive.test.ts` — tests it; not imported here.

## Notes
- The caller must have registered every module's hooks, because minimise and erase come from the module manifests. For the warning mail, translations must also be booted. The caller owns the job's lease too.
- The warning email greets by name only when the address is the verified one. Warnings also go to unverified accounts, and a display name is user-supplied text.
- Soft delete can return `false` when the account gained a staff role after it was read. That account is left alone, not counted, and logged with `logger.warn`.
- Deletes run with a system caller context. No request or user is behind them, so the audit trail is the only record. The hard delete passes its own audit context because it does not go through `createDeleteController`.
- A stage 0 failure is logged per account and retried the next night, without stopping the other accounts.
- Accounts are processed sequentially. `warn` and `eraseInactive` are awaited inside the loops without error handling, so any throw there ends the run.
- `hardDeleted` counts every account found, even though the file does not check the result of `eraseInactive`.
