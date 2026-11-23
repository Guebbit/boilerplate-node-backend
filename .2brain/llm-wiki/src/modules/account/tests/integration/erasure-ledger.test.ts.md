---
source: src/modules/account/tests/integration/erasure-ledger.test.ts
generated_at: 2026-11-22T03:54:56.664329+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/erasure-ledger.test.ts

## Purpose
Integration tests for the account module's erasure ledger. They check that a ledger row is written inside the erasure transaction (and absent after a rollback), that scheduling and cancelling a deletion are noted, and that `reapplyErasures` replays the ledger onto a restored database. The replay rules under test: the latest event per account wins, erased beats everything, and a second run changes nothing.

## Key elements
- **Helpers**
  - `ledger()` returns every ledger row, oldest first.
  - `rowsOf(userId)` returns one account's rows.
  - `backdate()` moves a row's `at` back in time.
  - `restoreFromSnapshot(id, email)` recreates an erased user with the same id and email, as a restored backup would.
  - `plantRow()` writes a `scheduled` or `canceled` ledger row directly.
  - `lockedInSnapshot()` creates a user locked by its owner (`deletedAt`, `deletedBy: 'owner'`, `purgeAt`).
  - `since()` returns a snapshot instant ten days back.
  - `DAY` is one day in milliseconds.
- **`describe('the ledger is written with the erasure')`**
  - An erasure adds exactly one row, with only `_id`, `userId`, `kind`, `at` and `expiresAt` (no personal data).
  - `expiresAt` is 220 days after `at`.
  - A failed erasure rolls back and leaves no row.
  - An admin hard delete also writes an `erased` row.
  - Cancelling a deletion via a restore link writes a single `canceled` row.
- **`describe('reapplyErasures')`**
  - Only `erased` rows since the snapshot are replayed. Older rows and `canceled` rows are left alone.
  - The original date is kept and no second row is added.
  - `accountUserService.eraseAgain` dates a fresh row, and its expiry, from the original erasure.
  - An account the restored database never held is counted as `alreadyGone`, and a second run returns an identical report.
  - A failed erasure is counted as `failed`, left for the next run, and finished by a retry.
  - An audit event with action `AUTH_ERASURES_REAPPLIED` records `by`, `snapshot`, `erased` and `failed`.
  - The ledger is unchanged by a replay.
- **`describe('reapplyErasures — deletion locks')`**: the visible part covers clearing a lock the owner canceled after the snapshot, even when its `purgeAt` has passed. Report buckets used across the file are `erased`, `unchanged`, `alreadyGone`, `rescheduled`, `unscheduled` and `failed`, summarised by `countsOf`.

## Relationships
- Under test: `src/modules/account/services/erasure-ledger.ts` (`reapplyErasures`, `countsOf`, `recordSchedule`) and `src/modules/account/services/account-deletion.ts` (`restoreAccountByLink`, `handleRestoredByStaff`). It also calls `accountService` from `src/modules/account/services/index.ts`.
- Reads and writes ledger data through `erasureLedgerModel` (`src/modules/account/model.ts`). It imports `erasureLedgerRepository` from `src/modules/account/repository.ts`.
- Uses `accountAuditActions` (`src/modules/account/audit.ts`) to assert the audit event. The audit port (`src/infrastructure/observability/audit.ts`) is replaced with `auditPortMock()` from `@tests/ports`.
- Drives the users module through `createUser`, `eraseAsScheduled` and `userRepository` from the users test factories, and through `src/modules/users/index.ts` (`userService`), `src/modules/users/friends/account.ts` (`accountUserService`), `src/modules/users/repository.ts` and `src/modules/users/services/index.ts`. The tests call `userService.removeById` and `accountUserService.eraseAgain` (the latter is also spied on to simulate a failure).
- Uses `plantToken` and `tokenRowsOf` from `src/modules/account/tests/factories.ts` to plant restore tokens.
- Uses `systemCallerContext` from `src/kernel/permissions.ts` and `testCallerContext` from `@tests/callers`.
- Uses `src/kernel/events.ts` (`resetDomainEvents` in cleanup, plus `markDomainEventsWired` and `onDomainEvent`) and `holdJob`/`jobModel` from `src/infrastructure/persistence/job-store.ts`.

## Notes
- `@infrastructure/adapters/mailer` is mocked so `enqueueEmail` resolves without sending.
- `setupTestDb()` provides the database. `registerCheckoutModules()` runs before each test. `afterEach` restores mocks and resets domain events.
- The rollback test relies on the user document's delete being the last write of the cascade, after the ledger write. It makes `userRepository.deleteOne` fail once to trigger the rollback.
- Several imports (`markDomainEventsWired`, `onDomainEvent`, `holdJob`, `jobModel`, `tokenRowsOf`, `recordSchedule`, `handleRestoredByStaff`, `restoreAccountByLink`) are not used in the visible portion of the file.
