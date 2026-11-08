---
source: src/modules/users/tests/integration/reaper.test.ts
sha256: cdbd97c81d25885316692328e7f8741b8fa19b1f06bbe1387346b2844e2a18c7
generated_at: 2026-11-08T08:55:57.682987+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/reaper.test.ts

## Purpose

Integration tests for the inactivity reaper pipeline. Verifies that across its three stages (warn → soft-delete → hard-delete), the reaper targets only customer-level accounts and never touches staff, admin, or platform-operator accounts, regardless of their inactivity. Also covers the `deletedBy` marker lifecycle, refusal conditions, and that API-key usage counts as activity.

## Key elements

- **`makeInactive(id, extra?)`** — Backdates `createdAt` to `LONG_AGO` (2020-01-01) via `userModel.updateOne` with `overwriteImmutable: true`, simulating an account with no recent session activity.
- **`inactiveAccount(name, role?, platformRole?)`** — Creates a user (optionally with a role or platform membership), then marks it inactive.
- **`warnedUser(overrides, role?)`** — Creates a user and stamps `inactivityWarnedAt`, returning the full Mongoose document.
- **`daysAgo(days)`** — Returns a `Date` `days` days before now.
- **`emailsOf(accounts)`** — Extracts a sorted email array for assertions.
- **`markerOf(id)`** — Reads the stored `deletedBy` value to assert soft-delete attribution.
- **`describe` blocks** — Five groups: candidate queries, soft-delete attribution, soft-delete refusals, hard-delete (`eraseInactive`), and API-key-activity interaction.
- **`userService` methods under test** — `findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`, `softDeleteInactive`, `eraseInactive`, `removeById`, `restoreById`.

## Relationships

- **`src/modules/users/services/index.ts`** — Imports `userService`; every assertion exercises one of its reaper methods.
- **`src/modules/users/model.ts`** — Imports `userModel` for direct DB writes (`makeInactive`, `warnedUser`) and reads (`markerOf`, document inspection).
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` to build fixture accounts with roles.
- **`src/modules/access/tests/factories.ts`** — Imports `seedMembership` to attach a platform-level role (e.g. `'operator'`).
- **`src/kernel/permissions.ts`** — Imports `systemCallerContext` to supply the caller context the reaper expects.
- **`tests/support/callers.ts`** — Imports `callerContextAs` to simulate a staff/admin caller for `removeById` / `restoreById`.
- **`tests/support/setup-test-db.ts`** — Imports `setupTestDb` (called at module top-level) to reset the database before each test.

## Notes

- `createdAt` is immutable in Mongoose; `makeInactive` must pass `overwriteImmutable: true` or the update is silently stripped. The file documents this in a comment on the helper.
- For accounts that never refreshed a session, `createdAt` effectively *is* the last-activity timestamp — the tests rely on this convention.
- The reaper identifies its own soft-deletes via the `deletedBy: 'reaper'` marker; a staff soft-delete (via `removeById`) has no such marker and is never eligible for hard-delete.
- `lastApiKeyUseAt` is treated as activity on par with `lastActiveAt` for all three stages; the test file covers this explicitly in the final `describe` block.
- All tests use `NOW = new Date()` captured once at module load, so "long ago" (`LONG_AGO`, year 2020) is always well past any cutoff.
