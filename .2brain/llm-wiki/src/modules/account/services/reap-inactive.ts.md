---
source: src/modules/account/services/reap-inactive.ts
sha256: a26462fdd6519fa98d3d968cd3047126eb5af9256b8042bb4fd9884867568ab6
generated_at: 2026-10-29T02:43:39.727729+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/reap-inactive.ts

## Purpose

Implements the four-stage inactivity reaper (minimise → warn → soft-delete → hard-delete) as a pure, ordered pipeline. It is deliberately separated from its cron caller so that stage ordering is a unit-testable fact of this module rather than an emergent property of a script file.

## Key elements

- **`reapInactiveAccounts({ inactiveDays, minimiseDays })`** — sole public entry point. Runs stage 0 (minimise) when `minimiseDays > 0`, then stages 1–3 (deletion path) when `inactiveDays > 0`. Returns an `InactiveReapCounts`.
- **`InactiveReapCounts`** — exported interface: `{ minimised, warned, softDeleted, hardDeleted }`, one count per stage.
- **`deletionStages(inactiveDays)`** — internal async helper for stages 1–3; queries users to warn, soft-delete, and hard-delete in sequence, logging a summary at the end.
- **`warn(user)`** — internal; composes the i18n warning email via `inactivityWarningEmail`, enqueues it, then stamps `inactivityWarnedAt` via `userService.markInactivityWarned`.
- **`minimiseStage(minimiseDays)`** — internal; calls `userService.minimiseInactiveBefore`, logs the result, and returns the count. Per-account failures are contained (logged, not thrown) so one bad record doesn't halt the rest.
- **`GRACE_DAYS`** — module-level constant (30). Fixed, not configurable; keeps the single `inactiveDays` dial in day units.
- **`daysAgo(days)`** — tiny utility returning `Date` for *days* days before now, using `DAY_MS`.

## Relationships

- **`src/modules/users/index.ts`** — primary dependency. Imports `userService` (all query/mutation methods: `minimiseInactiveBefore`, `markInactivityWarned`, `findInactiveUnwarned`, `findWarnedStillInactive`, `softDeleteInactive`, `findReaperSoftDeletedPastGrace`, `eraseInactive`) and the `UserDocument` type.
- **`src/modules/account/emails.ts`** — provides `inactivityWarningEmail` (locale-aware template builder) and `greetableName` (safe display-name helper).
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the transport for the stage-1 warning.
- **`src/infrastructure/i18n/index.ts`** — `getDefaultLocale` is the fallback when a user has no stored locale.
- **`src/infrastructure/adapters/logger.ts`** — `logger.info` records each stage's completion with counts.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` supplies the audit-context object passed to soft/hard deletes (no HTTP request behind them).
- **`src/domain-primitives/time.ts`** — `DAY_MS` constant for date arithmetic.
- **`src/modules/account/services/index.ts`** — barrel re-export; makes `reapInactiveAccounts` reachable to the jobs layer.
- **`src/modules/account/jobs.ts`** — the cron caller that invokes `reapInactiveAccounts`, owns the job lease, and ensures translations/module hooks are booted before calling.
- **`src/modules/account/tests/integration/reap-inactive.test.ts`** — integration tests that assert the exact stage ordering and the "zero disables that stage" contract.

## Notes

- Stage ordering is the contract: minimise → warn → soft-delete → hard-delete. The doc-block at the top and the integration test together pin this; do not reorder without updating both.
- `GRACE_DAYS` is **not** a user-facing setting. The only two dials are `inactiveDays` and `minimiseDays`; setting either to `0` disables that entire branch.
- The warning email intentionally uses the *verified* email address for the greeting name check — accounts that never verified are still warned but get a neutral greeting.
- Both delete stages pass a `systemCallerContext` rather than a user-scoped one; this is the audit trail for a process with no interactive actor.
- The caller (job layer) is responsible for booting i18n translations and registering per-module `personalData.minimise` / `erase` hooks *before* invoking this function; none of that setup lives here.
