---
source: src/modules/account/tests/integration/purge-deletions.test.ts
source_sha256: 5d9f9fdebbee55bbce3d569bdad8bfb443057fc9c9cc6787a27b829e58b367d7
context_sha256: 35fb0f29e8d80effc20530bacd46132994f337e3c2048777699e80d25dcbcb37
generated_at: 2026-11-22T03:58:59.458771+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/purge-deletions.test.ts

## Purpose
Integration test for `accountService.purgeScheduledDeletions()`, the purge behind the `reap:scheduled-deletions` job. It checks that due, owner-requested deletions are erased through the real cascade and that nothing else is touched: not-yet-due rows, admin soft deletes and inactivity-reaper rows are kept, a second run is a no-op, and the audit trail records the system as the eraser.

## Key elements
- `jest.mock` of `@infrastructure/observability/audit`: replaces the audit port with `auditPortMock()` from `@tests/ports`. It is not a spy.
- `jest.mock` of `@infrastructure/adapters/mailer`: keeps the real module but makes `enqueueEmail` a resolved `jest.fn()`, so the mail queue can be read back.
- `setupTestDb()`: sets up the test database.
- `beforeEach`: calls `registerCheckoutModules()` and clears the `enqueueEmail` mock.
- `afterEach`: calls `resetDomainEvents()`.
- `daysFromNow(days)`: returns a date offset from now; negative values are in the past.
- `scheduled(email, purgeAt)`: creates a verified user with `deletedAt` 30 days ago, `deletedBy: 'owner'` and the given `purgeAt`. It also plants a session and an `account-restore` token.
- Test cases:
  - Erases a due account plus its sessions and tokens. A not-yet-due account, an admin-deleted user and a reaper-deleted user all survive. The counts are `{ purged: 1, skipped: 0, failed: 0 }`.
  - A second run returns all-zero counts.
  - A goodbye email (`account.deleted`) goes to the address the account had. The audit events include `system.user.erased` and not `admin.user.erased`. The audit event `AUTH_ACCOUNT_DELETE_COMPLETED` is emitted with `actorUserId` set to the erased user.
  - An account whose `purgeAt` is pushed into the future after being scheduled is skipped (`purged` is 0) and still exists.

## Relationships
- `src/modules/account/services/index.ts`: supplies `accountService`, the unit under test.
- `src/modules/users/tests/factories.ts`: supplies `createUser` and `userRepository`, used to seed users and check existence. `updateMany` on the repository is used to simulate a restore.
- `src/modules/account/tests/factories.ts`: supplies `plantSession`, `plantToken`, `sessionRowsOf` and `tokenRowsOf`, used to seed and inspect dependent rows.
- `src/modules/account/audit.ts`: supplies `accountAuditActions`, used to assert the completion audit action.
- `src/infrastructure/observability/audit.ts`: mocked, and `emitAuditEvent` is observed through `observePort` from `tests/support/ports.ts`.
- `src/infrastructure/adapters/mailer.ts`: partially mocked, and `enqueueEmail` calls are inspected.
- `tests/support/checkout-modules.ts`: `registerCheckoutModules` registers every module's erase hook.
- `tests/support/setup-test-db.ts`: provides the database lifecycle.
- `src/kernel/events.ts`: `resetDomainEvents` clears event state between tests.
- `src/modules/users/repository.ts`: reached only through the users test factories' `userRepository`.

## Notes
- The cascade is the real one, so the erase hooks of all modules must be registered in `beforeEach`, as a boot would do.
- The mailer mock spreads the real module, so only `enqueueEmail` is replaced.
- Rows are distinguished by `deletedBy` (`owner`, `reaper`, or unset for the admin soft delete) and by `purgeAt`.
