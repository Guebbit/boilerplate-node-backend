---
source: src/modules/users/tests/integration/scheduled-deletion.test.ts
sha256: 00820e8337ddf92ce4da63125b5fd60ec60e25006b46de87a79a7180d6dff99b
generated_at: 2026-10-29T06:22:32.916432+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/scheduled-deletion.test.ts

## Purpose

Integration tests (run against a real database) for the owner-scheduled deletion lifecycle: scheduling a deletion with a `purgeAt` grace period, restoring within that grace, and erasing once the grace has expired. The suite specifically validates the concurrency invariants—conditional restore vs. unconditional erase—that a unit-level mock would not exercise.

## Key elements

- **`daysFromNow(days)`** — helper returning a `Date` offset from now (negative = past).
- **`stored(id)`** — thin wrapper around `userModel.findById(id).exec()`; resolves `null` when the document is gone.
- **`scheduled(email, purgeAt)`** — creates a user via the factory, calls `userService.scheduleOwnDeletion`, then re-reads the document so tests start from the persisted state.
- **`describe('scheduleOwnDeletion')`** — asserts the lock fields (`deletedAt`, `deletedBy: 'owner'`, `purgeAt`, `tokensValidAfter`), that `isAuthenticatable` is false, and that `isRestorable` is true.
- **`describe('isRestorable')`** — verifies the predicate returns `false` for banned accounts, admin soft-deletes, and lapsed grace periods.
- **`describe('restoreOwnAccount')`** — covers restore inside the grace (clears deletion fields, keeps `tokensValidAfter`), no-op after `purgeAt`, and a concurrent double-restore where exactly one call wins.
- **`describe('eraseScheduledDeletion')`** — covers successful erase past grace (document gone), 409 refusal while grace is active, 409 when a restore raced ahead of the erase, and 409 for reaper-soft-deleted rows. All erase calls pass `systemCallerContext('User')`.
- **`describe('findDueScheduledDeletions')`** — confirms only owner-scheduled rows past `purgeAt` are returned; reaper and admin deletions are excluded.
- **`describe('the inactivity reaper')`** — asserts `findReaperSoftDeletedPastGrace` never surfaces an owner-scheduled account, regardless of age.

## Relationships

- **`src/modules/users/services/index.ts`** — the primary SUT; every test calls `userService.scheduleOwnDeletion`, `.restoreOwnAccount`, `.eraseScheduledDeletion`, `.findDueScheduledDeletions`, or `.findReaperSoftDeletedPastGrace`.
- **`src/modules/users/model.ts`** — `userModel` is used for direct reads (`stored` helper) and for the race-condition test that mutates `purgeAt` via `updateOne`.
- **`src/modules/users/authenticatable.ts`** — provides the `isAuthenticatable` and `isRestorable` predicates that several assertions check directly.
- **`src/kernel/permissions.ts`** — supplies `systemCallerContext('User')`, the caller context required by `eraseScheduledDeletion`.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the fixture accounts.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to provision a real database before any test runs.

## Notes

- The suite intentionally targets a **real database** (not in-memory) because the core guarantees under test—conditional restore vs. unconditional erase, and the single-winner concurrency rule—depend on atomic document-level semantics.
- The "raced" erase test simulates a restore-after-read by directly rewriting `purgeAt` in the DB between the reaper's implicit read and the `eraseScheduledDeletion` call; this is the only place the test mutates the model outside the service layer.
- `systemCallerContext` is required for erase calls, meaning the erase path enforces a system-level permission check that a plain user context would not satisfy.
