---
source: scripts/ops/reap-inactive-accounts.ts
sha256: 6129f65f0735de3a86eaaf818e486fe3992fd0a06908505fdd04a940f766ff89
generated_at: 2026-09-23T17:29:38.436709+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-inactive-accounts.ts

## Purpose

Periodic cron job (`npm run reap:inactive-accounts`) that progresses accounts through three inactivity stages — email warning, soft delete, hard delete — based on a single `NODE_INACTIVE_ACCOUNT_DAYS` threshold plus a fixed 30-day grace between stages. Disabled by default (`NODE_INACTIVE_ACCOUNT_DAYS=0`) so that a boilerplate deployment never deletes a live account.

## Key elements

- **`GRACE_DAYS`** (const 30) — fixed pause between stages; intentionally not configurable so the script has one dial.
- **`LEASE_TTL_MS`** (15 min) — lease window for `withLease`; tuned so a slow night isn't pre-empted but a crashed holder doesn't block for long.
- **`initI18n()`** — registers module locale directories and initialises `i18next` so translated email copy renders outside the HTTP process.
- **`warn(user)`** — Stage 1: builds the email via `inactivityWarningEmail`, enqueues it, then stamps `inactivityWarnedAt`.
- **`main()`** — Reads the threshold, acquires the lease, starts the DB, registers modules, initialises i18n, then runs the three query–act loops (`findInactiveUnwarned` → warn, `findWarnedStillInactive` → soft delete, `findReaperSoftDeletedPastGrace` → hard delete).
- **`runScript(main, teardown)`** — Wraps the entry point so `stopDatabase()` and `stopQueue()` run on exit.

## Relationships

- **`scripts/db/run-script.ts`** — `runScript` provides the process-lifecycle wrapper (startup guard, teardown callback).
- **`src/infrastructure/persistence/lease.ts`** — `withLease` prevents a double-run; this script is the only nightly job currently wired to the primitive.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber` reads `NODE_INACTIVE_ACCOUNT_DAYS`.
- **`src/infrastructure/runtime/database.ts`** — `start` / `stopDatabase` manage the Mongo connection for this standalone process.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` delivers the stage-one warning.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue` in teardown.
- **`src/infrastructure/i18n/index.ts` & `catalog.ts`** — Locale helpers and resource loading for email rendering.
- **`src/kernel/registry.ts`** — `registerModules` wires up service registrations so `userService` is available.
- **`src/modules.ts`** — `enabledModules` provides the list of module locale directories and service registrations.
- **`src/modules/users/index.ts` / `model.ts`** — `userService` (query + remove + markInactivityWarned) and the `UserDocument` type carrying `inactivityWarnedAt`.
- **`src/modules/account/emails.ts`** — `inactivityWarningEmail` template builder.
- **`src/infrastructure/adapters/logger.ts`** — Structured log output at each decision point.

## Notes

- **Disabled by default.** `NODE_INACTIVE_ACCOUNT_DAYS <= 0` causes an immediate no-op exit. Enable explicitly per deployment.
- **Re-activation resets the clock.** `LAST_ACTIVE_EXPR` is recomputed on each run, so a user who signs back in is excluded from all later stages. However, if that user _again_ goes inactive, the stale `inactivityWarnedAt` means they skip the fresh warning email and go straight to soft delete after the first grace period. Documented as an acceptable trade-off for a disabled-by-default safety net.
- **Not a boot-time job.** Intended for the same cron container as `reap:quarantine` and `reap:orders`; running it on every process start would be incorrect.
- **Ownership.** The script, its npm alias, and its crontab entry all belong to the `account` module and should be removed together if the module is removed.
- **Hard delete cascades.** Stage three calls `userService.remove(user, true)`, which emits `USER_DELETED` and cascades identically to an admin-initiated hard delete.
