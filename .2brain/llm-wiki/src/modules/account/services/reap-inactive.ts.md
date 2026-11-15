---
source: src/modules/account/services/reap-inactive.ts
sha256: 19caa0ac1adca30e0929785ef5ed594e5443289af455747b01428a27a5df8655
generated_at: 2026-11-14T18:49:51.270878+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reap-inactive.ts

## Purpose

Implements the four-stage inactivity reaper for user accounts: minimise personal data (stage 0), warn by email (stage 1), soft-delete (stage 2), and hard-delete (stage 3). It lives in its own importable module rather than inside the cron script so that the stage order and gating logic are a tested, verifiable fact. Two numeric dials (`minimiseDays`, `inactiveDays`) control which stages activate; a value of `0` switches a stage off.

## Key elements

- **`reapInactiveAccounts`** (exported) — Main entry point. Accepts `{ inactiveDays, minimiseDays }`, runs stage 0 then stages 1–3, and returns an `InactiveReapCounts` summary.
- **`InactiveReapCounts`** (exported interface) — Counters for how many accounts each of the four stages touched.
- **`minimiseStage`** — Stage 0: calls `accountUserService.minimiseInactiveBefore`, logs the result, returns the number minimised.
- **`deletionStages`** — Stages 1–3: warns, soft-deletes, hard-deletes. Uses `systemCallerContext('User')` for the delete audit trail.
- **`warn`** — Stage 1: builds the warning email via `inactivityWarningEmail`, enqueues it, then stamps `inactivityWarnedAt`.
- **`GRACE_DAYS`** — Fixed 30-day pause between warn→soft-delete and soft-delete→hard-delete. Deliberately non-configurable.
- **`daysAgo`** — Small helper returning a `Date` *n* days in the past using `DAY_MS`.

## Relationships

- **`@modules/users/friends/account`** — `accountUserService` performs every data operation (find, minimise, mark-warned, soft-delete, erase). This file is a pure orchestration layer over that service.
- **`@modules/account/emails`** — Supplies `inactivityWarningEmail` (subject + template + data) and `greetableName` (display-name helper) used by `warn`.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` delivers the warning mail asynchronously.
- **`@infrastructure/adapters/logger`** — Structured logs after each stage and on the staff-role skip.
- **`@kernel/permissions`** — `systemCallerContext('User')` provides the audit-context passed to soft-delete and hard-delete (no HTTP request behind them).
- **`@infrastructure/i18n`** — `getDefaultLocale` fallback when a user has no stored locale.
- **`@domain-primitives/time`** — `DAY_MS` constant for all date arithmetic.
- **`@modules/account/jobs`** — Upstream consumer; owns the cron lease and calls `reapInactiveAccounts`.
- **`src/modules/account/tests/integration/reap-inactive.test.ts`** — Integration tests exercising the stage ordering and gating.
- **`src/modules/account/services/index.ts`** — Barrel re-export for this module.

## Notes

- **Staff-role guard:** If an account gained a staff role between the read and the soft-delete, the delete is silently skipped (logged as a warning) and not counted. This is a concurrency safety net, not a configurable policy.
- **Greeting security:** `greetableName(user, user.email)` only includes the display name when the email is the verified one, because the warning mail can go to unverified addresses and a display name is user-supplied text.
- **Failure isolation:** Stage 0 (minimise) logs per-account failures and continues; a single bad account never halts the batch.
- **Preconditions owned by the caller:** The caller (the job) must have booted i18n translations and registered every module's hooks before calling `reapInactiveAccounts`. This file assumes both are in place.
- **`GRACE_DAYS` is a constant, not a dial:** Changing it requires a code change. The design intent is that operators get exactly two knobs (`minimiseDays`, `inactiveDays`) rather than four.
