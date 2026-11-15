---
source: src/modules/users/tests/integration/reaper.test.ts
sha256: 6340f7d58af5d78a08d6e5570ace859d5e48afeb1030e7cca31011e6d34b5fe6
generated_at: 2026-11-14T22:37:19.005801+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/reaper.test.ts

## Purpose
Integration tests for the inactivity reaper's three-stage lifecycle (warn → soft-delete → hard-delete), verifying that only customer-level accounts are ever targeted while staff, admin, and platform-operator accounts are excluded at every stage. Also covers the `deletedBy` marker semantics, refusal paths, and the "proof of life" signals (`lastActiveAt`, `lastApiKeyUseAt`).

## Key elements
- **`makeInactive(id, extra)`** — Direct Mongoose update that backdates `createdAt` (the activity proxy) to `LONG_AGO` and optionally sets extra fields (`inactivityWarnedAt`, `deletedBy`, `deletedAt`, `lastActiveAt`, `lastApiKeyUseAt`, `active`). Uses `overwriteImmutable: true` to bypass Mongoose's `createdAt` immutability.
- **`inactiveAccount(name, role?, platformRole?)`** — Creates a user, optionally seeds a platform membership, then marks them inactive. Returns the created user.
- **`warnedUser(overrides, role?)`** — Creates a user and sets `inactivityWarnedAt` to "now", then re-fetches the full document (needed so the warning is visible to `softDeleteInactive`).
- **`markerOf(id)`** — Reads the raw `deletedBy` field from the DB.
- **`emailsOf(accounts)`** — Extracts and sorts emails for stable assertions.
- **`daysAgo(days)`** — Returns a Date `days` days before now.
- **Test suites (`describe` blocks):**
  - *Candidates* — `findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace` return only eligible customer accounts; staff/admin/manager/support/none-role are excluded; grace period measured from warning, not from inactivity start.
  - *Who soft-deleted* — Reaper sets `deletedBy: 'reaper'`; staff deletion via `userService.removeById` leaves it undefined; `restoreById` clears it.
  - *Soft-delete refusals* — Rejects unwarned accounts (throws `'warned'`) and any staff-role account (returns `false`).
  - *Hard delete* — `eraseInactive` erases only reaper-marked soft-deletes; rejects staff soft-deletes (throws `'soft-deleted'`).
  - *API-key use* — A recent `lastApiKeyUseAt` (≤ 30 days) keeps an account out of the warning stage; an old one does not.

## Relationships
- **`src/modules/users/friends/account.ts`** — Primary subject under test. The suite calls its `findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`, `softDeleteInactive`, and `eraseInactive` methods to drive each reaper stage.
- **`src/modules/users/model.ts`** — `userModel` used directly for backdating `createdAt` and asserting the `deletedBy` marker.
- **`src/modules/users/services/index.ts`** — `userService.removeById` and `userService.restoreById` simulate staff-level soft-delete and restore to verify that the reaper's marker is isolated from manual deletions.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` provides the reaper's caller context for its service calls.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` provides the admin context for staff-side actions.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory for building test accounts with a given role.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` grants a platform-level role (e.g. `'operator'`) independent of the shop role.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` boots the test database before the suite runs.

## Notes
- `createdAt` doubles as the "last activity" timestamp in these tests because the reaper treats it that way when no session has been refreshed; there is no separate `lastActiveAt` by default.
- The reaper is always invoked with `systemCallerContext('User')`; staff actions use `callerContextAs('admin')`. Confusing these two contexts would change the permission outcome.
- `overwriteImmutable: true` is required in `makeInactive` because Mongoose marks `createdAt` immutable by default; without it the `$set` is silently dropped.
- `softDeleteInactive` returns `false` (not throws) when rejecting a staff account, but **throws** (message contains `'warned'`) when the account was never warned — two distinct failure modes tested separately.
- The "boomerang" scenario (warned → returned → idle again) is the key regression guard: a return resets the warning stage but must **not** reset the soft-delete grace period.
