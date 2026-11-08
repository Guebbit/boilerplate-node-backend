---
source: src/modules/account/services/reap-inactive.ts
sha256: a26462fdd6519fa98d3d968cd3047126eb5af9256b8042bb4fd9884867568ab6
generated_at: 2026-11-08T04:21:47.893697+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reap-inactive.ts

## Purpose

Defines the four ordered stages of the inactivity reaper (minimise → warn → soft delete → hard delete) as a pure service, deliberately separated from the cron script so that stage ordering is a tested invariant rather than a side-effect of file layout. Two numeric dials (`minimiseDays`, `inactiveDays`) gate which stages run; a value of `0` switches that path off entirely.

## Key elements

- **`reapInactiveAccounts({ inactiveDays, minimiseDays })`** — Public entry point. Runs stage 0 (minimise) if `minimiseDays > 0`, then stages 1–3 (deletion) if `inactiveDays > 0`. Returns an `InactiveReapCounts` object. Caller must have registered per-module minimise/erase hooks and booted i18n translations before invoking.
- **`InactiveReapCounts`** — Exported interface with four counters: `minimised`, `warned`, `softDeleted`, `hardDeleted`.
- **`deletionStages`** (private) — Iterates users found by `userService` and executes warn → soft-delete → hard-delete in sequence, using `systemCallerContext('User')` as the audit actor for both delete calls.
- **`minimiseStage`** (private) — Calls `userService.minimiseInactiveBefore(daysAgo(minimiseDays))`; a per-account failure is logged and retried on the next run without halting the batch.
- **`warn`** (private) — Builds the email via `inactivityWarningEmail`, enqueues it, then stamps `inactivityWarnedAt` through `userService.markInactivityWarned`.
- **`GRACE_DAYS`** — Fixed 30-day pause between warn→soft-delete and soft-delete→hard-delete. Not configurable.
- **`daysAgo`** (private) — Small helper converting a day offset to a `Date` using `DAY_MS`.

## Relationships

- **`@modules/users`** (`userService`, `UserDocument`) — All persistence queries (`minimiseInactiveBefore`, `findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`, `markInactivityWarned`, `softDeleteInactive`, `eraseInactive`) live there; this file only orchestrates order and context.
- **`src/modules/account/emails.ts`** — Supplies `inactivityWarningEmail` (locale-aware template + data) and `greetableName` (safe display-name resolution).
- **`src/kernel/permissions.ts`** — Provides `systemCallerContext`, the audit-actor token passed to both delete calls since no HTTP request is in scope.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the transport for the stage-1 warning.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging at the end of each stage.
- **`src/infrastructure/i18n/index.ts`** — `getDefaultLocale` used as a fallback when the user has no stored locale.
- **`src/domain-primitives/time.ts`** — `DAY_MS` constant for date arithmetic.
- **`src/modules/account/jobs.ts`** — The cron/lease holder that calls `reapInactiveAccounts` and owns the job lease.
- **`src/modules/account/services/index.ts`** — Barrel re-export so the module is importable as `@modules/account/services`.
- **`src/modules/account/tests/integration/reap-inactive.test.ts`** — Integration test that asserts the stage order and count accounting.

## Notes

- The reaper does **not** manage its own lease, scheduling, or hook registration — those are the caller's (the job's) responsibility. Calling it outside that context will silently skip minimise/erase hooks that haven't been registered.
- `greetableName` receives `user.email` (the verified address), not a free-form display name, because the warning mail is also sent to accounts whose address was never verified.
- The two dials are independent: `minimiseDays` controls only stage 0; `inactiveDays` controls stages 1–3. Setting one to 0 does not affect the other.
- `GRACE_DAYS` is intentionally a compile-time constant, not a runtime setting, so the single operator-facing dial remains a plain day count.
