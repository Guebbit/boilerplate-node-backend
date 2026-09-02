# scripts/reap-inactive-accounts.ts

## Purpose

Three-stage periodic reaper that warns, soft-deletes, and hard-deletes user accounts whose last activity (refresh-token exchange or `createdAt`) exceeds `NODE_INACTIVE_ACCOUNT_DAYS`. Disabled by default (`0`) so a boilerplate deployment never silently deletes a live account.

## Key elements

- **`GRACE_DAYS`** — hardcoded 30-day pause between stages; intentionally not configurable so the script has exactly one env-var dial.
- **`daysAgo(days)`** — returns a `Date` that many days in the past.
- **`initI18n()`** — registers module locale directories and calls `i18next.init` so translated email copy can be rendered outside the HTTP process.
- **`warn(user)`** — Stage 1: builds the warning email via `inactivityWarningEmail`, enqueues it, then stamps `user.inactivityWarnedAt` and persists.
- **`main()`** — Reads the threshold, starts the database, registers modules, initialises i18n, then runs three sequential passes (`findInactiveUnwarned` → `findWarnedStillInactive` → `findReaperSoftDeletedPastGrace`), calling `userService.remove` for stages 2 & 3.
- **Entry point** — `runScript(main, cleanup)` from `db/run-script.ts`; cleanup calls `stopDatabase()` and `stopQueue()`.

## Relationships

- **`db/run-script.ts`** — provides `runScript`, which invokes `main` and runs the supplied cleanup callback on exit.
- **`src/infrastructure/runtime/database.ts`** — `start()` boots the DB connection; `stopDatabase()` tears it down.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber('NODE_INACTIVE_ACCOUNT_DAYS', 0)` reads the threshold.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue()` in the shutdown path.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` delivers the stage-1 warning.
- **`src/infrastructure/i18n/index.ts`** (re-exporting `catalog.ts`) — locale registration, resource loading, default/fallback/supported-locale helpers.
- **`src/kernel/registry.ts`** — `registerModules` makes module-level i18n namespaces available.
- **`src/modules.ts`** — `enabledModules` supplies the list of locale directories and registered modules.
- **`src/modules/users/index.ts`** — re-exports `userRepository`, `userService`, and the `UserDocument` type.
- **`src/modules/users/repository.ts`** — `findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`, and the `LAST_ACTIVE_EXPR` that defines "last active".
- **`src/modules/users/service.ts`** — `remove(user, softDelete)` performs stage 2 (soft) and stage 3 (hard, emitting `USER_DELETED` and cascading).
- **`src/modules/users/model.ts`** — `UserDocument` shape; `inactivityWarnedAt` distinguishes reaper-driven soft deletes from admin-initiated ones.
- **`src/modules/account/emails.ts`** — `inactivityWarningEmail` produces the locale-aware subject and template.
- **`src/infrastructure/adapters/logger.ts`** — structured `logger.info` calls for the disabled-exit and completion summary.

## Notes

- **Sequential awaits in for-loops** — each warning / deletion is awaited before the next, so a slow mail enqueue blocks the batch. Fine for a low-frequency cron job; would need parallelism for large fleets.
- **Reactivation gap** — `LAST_ACTIVE_EXPR` is recomputed each run, so signing back in resets the clock. However, if a user returns and later goes inactive *again*, the stale `inactivityWarnedAt` means stage 1 is skipped and they go straight to soft delete. Documented as acceptable for a disabled-by-default safety net.
- **`inactivityWarnedAt` doubles as a discriminator** — stage 3's query uses it to exclude accounts an admin soft-deleted for unrelated reasons.
- **Not a boot-time script** — intended for the same cron container that runs `reap:quarantine` and `reap:orders`.
- **`GRACE_DAYS` is not env-configurable** — the only tunable is the day threshold; the 30-day inter-stage pause is a deliberate fixed constant.
