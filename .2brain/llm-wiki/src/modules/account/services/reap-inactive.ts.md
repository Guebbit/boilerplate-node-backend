---
source: src/modules/account/services/reap-inactive.ts
sha256: b61c92e59aa94531ff5572ac1d4086a63c690e7167cfc05dd3e02f7ce9393a72
generated_at: 2026-10-15T10:02:13.854735+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reap-inactive.ts

## Purpose

Defines the staged inactivity-reaper pipeline (minimise → warn → soft-delete → hard-delete) as a single exported function. Kept separate from the cron script so that stage ordering is a unit-tested fact, not an implicit side-effect of a file nothing else imports.

## Key elements

- **`GRACE_DAYS`** (const, `30`) — fixed pause between warn/soft/hard stages; intentionally not configurable.
- **`daysAgo`** (private helper) — returns a `Date` `n` days in the past.
- **`warn`** (private) — sends the inactivity-warning email (via `enqueueEmail`) and stamps `inactivityWarnedAt` through `userService.markInactivityWarned`. Only includes the user's display name when the address is verified.
- **`minimiseStage`** (private) — calls `userService.minimiseInactiveBefore`, logs the result. Failures are per-account and non-fatal.
- **`deletionStages`** (private) — runs the three deletion sub-stages sequentially: find-and-warn, soft-delete past grace, hard-delete past grace. Uses `systemCallerContext('User')` as the audit actor for both deletes.
- **`reapInactiveAccounts`** (export) — orchestrates the pipeline. `minimiseDays > 0` triggers stage 0; `inactiveDays > 0` triggers stages 1–3. Either dial at `0` disables its path.

## Relationships

- **`scripts/ops/reap-inactive-accounts.ts`** — the cron/ops script that invokes `reapInactiveAccounts` and owns the job lease, module-hook registration, and i18n bootstrapping before calling in.
- **`src/modules/users`** (`userService`, `UserDocument`) — all account lookups and mutations (`minimiseInactiveBefore`, `findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`, `remove`) go through the users service.
- **`src/modules/account/emails.ts`** — provides `inactivityWarningEmail` (template + data) and `greetableName` for the warning mail.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the transport for the warning email.
- **`src/infrastructure/adapters/logger.ts`** — structured logging of stage completion.
- **`src/infrastructure/i18n`** — `getDefaultLocale` fallback when a user has no explicit locale.
- **`src/kernel/permissions.ts`** — `systemCallerContext` supplies the audit-trail identity for non-HTTP deletions.
- **`src/modules/account/services/index.ts`** — re-exports this module so downstream consumers import from the barrel.
- **`src/modules/account/tests/integration/reap-inactive.test.ts`** — integration tests that exercise stage ordering and per-account failure isolation.

## Notes

- The file does **not** register module hooks or boot i18n itself; the caller (the ops script) must do both before invoking `reapInactiveAccounts`.
- `GRACE_DAYS` is a hard-coded constant, not a dial. The two external dials are `minimiseDays` and `inactiveDays` (both day counts, `0` = off).
- Stage 0 (minimise) runs even when `inactiveDays` is `0`; the two dials are independent.
- The warning email deliberately uses `user.email` (not the display name) as the greeting fallback for unverified addresses, since the display name is untrusted user-supplied text.
- Deletions pass `systemCallerContext('User')` rather than a per-request context because there is no HTTP request behind the job; the audit trail is the sole record of who (the system) performed the deletion.
