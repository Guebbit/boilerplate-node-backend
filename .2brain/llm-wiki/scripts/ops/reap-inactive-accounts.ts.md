---
source: scripts/ops/reap-inactive-accounts.ts
sha256: 33a73ac89d3e63edb4fdb771442e69f779a74b05d98937949e730a2f378f256b
generated_at: 2026-10-14T07:24:03.675664+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-inactive-accounts.ts

## Purpose

GDPR Art. 5(1)(e) data-lifecycle script: minimises or deletes personal data for accounts that have been idle beyond a configurable threshold. Exposes two dials — `NODE_INACTIVE_MINIMISE_DAYS` (default 1095, on) for a destructive-but-reversible minimise pass, and `NODE_INACTIVE_ACCOUNT_DAYS` (default 0, off) for a staged warn → soft-delete → hard-delete path. Run periodically via `npm run reap:inactive-accounts`, never at boot.

## Key elements

- **`main()`** — Top-level orchestrator. Reads config from `accountConfig()`, acquires a Mongo-backed lease, registers module hooks, then runs the minimise stage and/or deletion stages in order. Skips cleanly if the lease is already held.
- **`minimiseStage(minimiseDays)`** — Stage 0. Calls `userService.minimiseInactiveBefore(daysAgo(minimiseDays))`, which invokes every module's `personalData.minimise` hook and stamps `inactivityMinimisedAt`. Runs even when deletion is disabled.
- **`deletionStages(inactiveDays)`** — Stages 1–3. Boots i18n, then sequentially: finds and warns unwarned accounts, soft-deletes warned-but-still-inactive accounts past grace, hard-deletes reaper-soft-deleted accounts past a second grace. Uses `systemCallerContext('User')` for audit since no HTTP request is present.
- **`warn(user)`** — Renders a translated warning email (via `inactivityWarningEmail` + `greetableName`) and enqueues it through `enqueueEmail`, then stamps `inactivityWarnedAt`.
- **`initI18n()`** — Calls `bootI18n` with the enabled modules' locale directories so email copy renders outside the HTTP process.
- **`GRACE_DAYS`** (const, 30) — Fixed pause between warn→soft-delete and soft-delete→hard-delete. Deliberately not configurable.
- **`LEASE_TTL_MS`** (const, 15 min) — How long the lease blocks a second runner. Reference implementation for `withLease`.
- **`daysAgo(n)`** — Simple `Date` helper.
- **Entry point** — `runScript(undefined, main, cleanup)`; `undefined` as the name prevents `runScript` from recording a second outcome that would overwrite the lease's own record.

## Relationships

- **`scripts/run-script.ts`** — Wraps `main` with structured error handling and a final `stopDatabase()` + `stopQueue()` teardown.
- **`src/infrastructure/persistence/lease.ts`** — Provides `withLease`; this script is the sole caller and the documented reference for the primitive.
- **`src/infrastructure/runtime/database.ts`** — `startJob()` opens the Mongo connection before the lease is acquired; `stopDatabase()` runs in the cleanup callback.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import that sets Mongoose defaults before any schema is built.
- **`src/infrastructure/config/dotenv.ts`** — Side-effect import that loads `.env` before any config is read.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` delivers the stage-1 warning.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue` in the shutdown path.
- **`src/infrastructure/i18n/boot.ts` / `catalog.ts` / `index.ts`** — `bootI18n` initialises translation; `getDefaultLocale` provides a fallback locale for accounts with no stored preference.
- **`src/kernel/registry.ts`** — `registerModules` activates all module hooks (including `personalData.minimise` and `personalData.erase`) before any stage runs.
- **`src/modules.ts`** — Supplies `enabledModules` and `enabledModuleDirectories('locales')`.
- **`src/modules/account/config.ts`** — `accountConfig()` reads the two `NODE_INACTIVE_*` dials and returns them as numbers.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` fabricates an audit context for deletions that have no HTTP request.

## Notes

- **Deletion ships off.** `NODE_INACTIVE_ACCOUNT_DAYS` defaults to `0`; a deployment must explicitly opt in. Minimise ships on (1095 days) because it only removes re-enterable data.
- **Grace runs from the warning, not from last activity.** This guarantees a single cron run can never warn and soft-delete the same account.
- **`deletedBy: 'reaper'`** is the marker that lets stage 3 distinguish its own soft deletes from a staff member's; it never hard-deletes the latter.
- **`lastActiveAt` is stamped at most once per day** (on sign-in or API-key use). Sessions are *not* consulted — an account that logged out looks identical to one never used.
- **Disabled accounts** (`active: false`) are excluded from every stage.
- **Lease-skip is a success path.** When `withLease` returns `undefined` (another holder active), `main` resolves normally and `runScript` records no failure. The `undefined` name argument to `runScript` exists specifically so this path doesn't get mis-recorded as an error.
- **Per-account failure isolation.** Stage 0 logs and continues on individual failures; the next nightly run retries. Deletion stages are sequential `for…await` loops, so one bad account halts the remaining batch.
