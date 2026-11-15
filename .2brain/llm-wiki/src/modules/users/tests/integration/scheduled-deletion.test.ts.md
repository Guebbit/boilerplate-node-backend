---
source: src/modules/users/tests/integration/scheduled-deletion.test.ts
sha256: 299faf3b7add0c196c15dc35ecc5d581ab5486e3fda9f0a7e5aeadf76b171624
generated_at: 2026-11-14T22:37:54.174952+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/scheduled-deletion.test.ts

## Purpose

Integration test for the owner-scheduled deletion lifecycle. Verifies, against a real database, that an account locked with a `purgeAt` can be restored only within the grace window, erased only after it expires, and that the two operations are mutually exclusive (concurrent restore vs. erase, TOCTOU races between the reaper's read and the conditional delete).

## Key elements

- **`scheduled(email, purgeAt)`** – creates a user via the factory, calls `scheduleOwnDeletion`, and returns the fresh DB row.
- **`restore(user)`** – wraps `accountUserService.restoreOwnAccount` in `withTransaction`, mirroring how production callers own the transaction.
- **`stored(id)`** – re-reads the document (or `null` if erased) to assert post-conditions.
- **`daysFromNow(days)`** – small date helper; negative values mean "ago".
- **`describe('scheduleOwnDeletion')`** – asserts the lock stamps `deletedAt`, `deletedBy: 'owner'`, `purgeAt`, `tokensValidAfter`, makes the account non-authenticatable but restorable.
- **`describe('isRestorable')`** – negative cases: banned, admin-soft-deleted, grace lapsed.
- **`describe('restoreOwnAccount')`** – success inside grace, no-op after `purgeAt`, and a concurrent double-restore where exactly one wins.
- **`describe('eraseScheduledDeletion')`** – erases when due, no-ops while grace runs, refuses a TOCTOU restore-after-read, refuses reaper-soft-deleted rows.
- **`describe('findDueScheduledDeletions')`** – query filter returns only owner-scheduled rows past `purgeAt`.
- **`describe('the inactivity reaper')`** – confirms the reaper query never surfaces owner-scheduled accounts.

## Relationships

- **`src/modules/users/friends/account.ts`** – primary system under test; exercises `scheduleOwnDeletion`, `restoreOwnAccount`, `eraseScheduledDeletion`, `findDueScheduledDeletions`, `findReaperSoftDeletedPastGrace`.
- **`src/modules/users/authenticatable.ts`** – imports `isAuthenticatable` / `isRestorable` predicates and asserts their return values directly.
- **`src/modules/users/model.ts`** – imports `userModel` for direct `findById` reads and one `$set` mutation (the TOCTOU race setup).
- **`src/infrastructure/runtime/database.ts`** – imports `withTransaction`, used by the `restore` helper.
- **`src/kernel/permissions.ts`** – imports `systemCallerContext` to build the caller context passed to `eraseScheduledDeletion`.
- **`src/modules/users/tests/factories.ts`** – imports `createUser` to seed accounts.
- **`tests/support/setup-test-db.ts`** – imports `setupTestDb`; called once at module top to provision a real database for the suite.

## Notes

- Lives under `tests/integration/` because it requires a real database; the conditional restore and erase rely on atomic DB claims that cannot be exercised with mocks.
- The concurrent-restore test (`Promise.all`) expects the array `[false, true]` after sorting — exactly one caller wins, enforced by the conditional update inside the transaction.
- The "raced" test simulates a TOCTOU by manually updating `purgeAt` *after* the reaper would have read the row, then calling `restore` before `eraseScheduledDeletion`; the erase must still refuse.
- `tokensValidAfter` is asserted to survive a restore unchanged — sessions invalidated by the lock stay dead even after the account is brought back.
