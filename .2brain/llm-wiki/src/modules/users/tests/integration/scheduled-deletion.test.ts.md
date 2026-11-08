---
source: src/modules/users/tests/integration/scheduled-deletion.test.ts
sha256: 00820e8337ddf92ce4da63125b5fd60ec60e25006b46de87a79a7180d6dff99b
generated_at: 2026-11-08T08:56:36.827701+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/scheduled-deletion.test.ts

## Purpose

Integration tests for the owner-scheduled deletion lifecycle (schedule → restore → erase) run against a real database. They exist because the correctness of the "restore *or* erase, never both" guarantee depends on conditional, atomic database operations that cannot be verified with unit-level mocks.

## Key elements

- **`daysFromNow(days)`** — local helper returning a `Date` offset by *days* (negative = past).
- **`stored(id)`** — shorthand for `userModel.findById(id).exec()`; returns the row or `null` if erased.
- **`scheduled(email, purgeAt)`** — creates a user via the factory, calls `userService.scheduleOwnDeletion`, and returns the persisted document.
- **`describe('scheduleOwnDeletion')`** — asserts the lock fields (`deletedAt`, `deletedBy`, `purgeAt`, `tokensValidAfter`), that `isAuthenticatable` is false, and `isRestorable` is true.
- **`describe('isRestorable')`** — verifies the predicate rejects banned accounts, admin soft-deletes, and lapsed graces.
- **`describe('restoreOwnAccount')`** — covers restore inside grace, no-op past grace, and a concurrent-restore race where exactly one of two parallel calls succeeds.
- **`describe('eraseScheduledDeletion')`** — covers erase when due, 409 during grace, a post-read restore race (simulated by manually rewriting `purgeAt` via `userModel.updateOne`), and refusal of reaper-soft-deleted rows.
- **`describe('findDueScheduledDeletions')`** — asserts the query returns only owner-scheduled rows past `purgeAt`, excluding reaper and admin deletions.
- **`describe('the inactivity reaper')`** — asserts `findReaperSoftDeletedPastGrace` never surfaces owner-scheduled accounts regardless of age.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/services/index.ts` | All service methods under test (`scheduleOwnDeletion`, `restoreOwnAccount`, `eraseScheduledDeletion`, `findDueScheduledDeletions`, `findReaperSoftDeletedPastGrace`) are imported from here. |
| `src/modules/users/authenticatable.ts` | `isAuthenticatable` and `isRestorable` predicates are called directly in assertions. |
| `src/modules/users/model.ts` | `userModel` is used for direct DB reads (`stored` helper) and a manual `updateOne` in the erase-race test. |
| `src/kernel/permissions.ts` | `systemCallerContext('User')` builds the caller context passed to `eraseScheduledDeletion`. |
| `src/modules/users/tests/factories.ts` | `createUser` factory seeds every test user. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is invoked at module scope to provision the real database connection. |

## Notes

- Tests require a live database; running them without the test DB fixture will fail at import time.
- The concurrent-restore test relies on the database's row-level locking to guarantee one-wins; it will pass even if the implementation is non-atomic as long as the second call sees the updated state.
- The erase-race test mutates `purgeAt` directly via the model (bypassing the service) to simulate a restore occurring between the reaper's SELECT and its conditional UPDATE—this is intentional and not a shortcut.
- `tokensValidAfter` is asserted to survive restore unchanged, ensuring previously-issued sessions remain invalid even after the account is un-locked.
