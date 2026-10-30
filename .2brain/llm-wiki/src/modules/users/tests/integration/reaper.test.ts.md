---
source: src/modules/users/tests/integration/reaper.test.ts
sha256: cdbd97c81d25885316692328e7f8741b8fa19b1f06bbe1387346b2844e2a18c7
generated_at: 2026-10-29T06:22:06.207243+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/reaper.test.ts

## Purpose

Integration tests for the inactivity reaper — the three-stage process (warn → soft-delete → hard-delete) that takes long-idle **customer** accounts offline. The file's core invariant: staff, admin, and platform-operator accounts are never candidates at any stage, regardless of activity.

## Key elements

- **`makeInactive(id, extra?)`** — Backdates a user's `createdAt` (treated as "last activity") via `userModel.updateOne` with `overwriteImmutable: true` so Mongoose doesn't strip the field.
- **`inactiveAccount(name, role?, platformRole?)`** — Creates a user, optionally seeds a platform membership, then backdates it.
- **`warnedUser(overrides, role?)`** — Creates a user, sets `inactivityWarnedAt`, and re-fetches the persisted document.
- **`daysAgo(n)`** / **`emailsOf(accounts)`** — Small date and assertion helpers.
- **`markerOf(id)`** — Reads the raw `deletedBy` field from the database.
- **`describe("the inactivity reaper's candidates")`** — Verifies each of the three `userService.find*` queries returns only eligible customer accounts; also covers re-warning after a return, grace-period timing, and disabled accounts.
- **`describe("who soft-deleted the account")`** — Asserts the `deletedBy: 'reaper'` marker is set by `softDeleteInactive` and cleared by `restoreById`.
- **`describe("the reaper's soft delete refusals")`** — Confirms `softDeleteInactive` rejects unwarned accounts and any account holding a staff role.
- **`describe("the reaper's hard delete")`** — Verifies `eraseInactive` erases a reaper-marked soft delete but returns `409` on a staff-made soft delete.
- **`describe("API-key use counts as activity")`** — Ensures a recent `lastApiKeyUseAt` keeps an account out of the warning and soft-delete stages.

## Relationships

- **`src/modules/users/services/index.ts`** — The system under test. All assertions target `userService.findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`, `softDeleteInactive`, `eraseInactive`, `removeById`, and `restoreById`.
- **`src/modules/users/model.ts`** — Provides `userModel` for direct Mongoose updates (backdating, setting flags) and raw reads (`findById`, `markerOf`).
- **`src/modules/users/tests/factories.ts`** — `createUser` factory for seeding test accounts with a given role.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` to attach a platform-level role (e.g. `operator`).
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` constructs the caller context the reaper runs under.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` simulates a staff/admin caller for the refusal and staff-soft-delete tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory or throwaway database before all tests.

## Notes

- **Mongoose `createdAt` immutability**: `makeInactive` must pass `{ timestamps: false, overwriteImmutable: true }` or the update is silently dropped.
- **Grace is measured from the warning, not from last activity**: a freshly-warned account is never soft-deleted even if its last activity is old.
- **`deletedBy` is the reaper's fingerprint**: the hard-delete stage only erases rows where `deletedBy === 'reaper'`; a staff-initiated soft delete (no marker) is off-limits.
- **Role filtering is exhaustive**: the first test seeds accounts with `customer`, `unverified`, no role, `manager`, `support`, `admin`, and platform `operator` to confirm only the first three pass.
- **API-key activity is a first-class signal**: `lastApiKeyUseAt` is checked alongside `lastActiveAt` and `createdAt` when computing inactivity.
