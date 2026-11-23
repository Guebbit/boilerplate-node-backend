---
source: src/modules/account/tests/integration/reap-inactive.test.ts
source_sha256: 5eac5dfae03d081b329d0d0bc6c3808efb3cd19bed46deccb763c36aad7e72cf
context_sha256: 5eac00c1925d02c0ca1b668ee84389e3e6fc40110472a21dc567370324b66098
generated_at: 2026-11-22T03:59:13.246201+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/reap-inactive.test.ts

## Purpose
Integration test for `reapInactiveAccounts`. It runs the real services against a real test database and checks the reaper's stage order. It minimises what each dial asks for, warns once, soft deletes only after a grace period following the warning, and hard deletes only after a grace period following the soft delete. It never performs two steps in one run. Which candidates each stage lists is covered by `src/modules/users/tests/integration/reaper.test.ts`, not here.

## Key elements
- `setupTestDb()`: called at module level to provision the test database.
- `daysAgo(days)`: returns a `Date` that many days before now.
- `users()`: the raw Mongo driver `users` collection. It lets the suite read accounts even after they are deleted.
- `backdate(id, fields)`: sets `createdAt` to 400 days ago, plus any extra fields the case needs (for example `inactivityWarnedAt`, `deletedBy`, `deletedAt`).
- `stateOf(id)`: reads `inactivityWarnedAt`, `inactivityMinimisedAt`, `deletedAt` and `deletedBy` from an account, or `null` once it is gone.
- `beforeEach` / `afterEach`: set `NODE_MAIL_TRANSPORT` to `'outbox'` and call `jest.restoreAllMocks()`.
- Test cases in `describe('reapInactiveAccounts')`:
  - **Warn once:** an inactive customer is warned, not deleted in the same run. A second run leaves `inactivityWarnedAt` unchanged. The first run's counts are `{ minimised: 0, warned: 1, softDeleted: 0, hardDeleted: 0 }`.
  - **Soft delete:** an account warned 31 days ago is soft deleted with `deletedBy: 'reaper'`.
  - **Staff-role race:** an account that gains a staff role after the read is left out of the `softDeleted` count and not deleted.
  - **Hard delete:** a reaper soft delete from 31 days ago is hard deleted, and `stateOf` then returns `null`.
  - **Minimise dial:** with `inactiveDays: 0, minimiseDays: 30`, the account is minimised and nothing is deleted.
  - **Both dials off:** nothing is warned or minimised.

## Relationships
- Calls `reapInactiveAccounts` from `../../services/reap-inactive`, the unit under test. It is passed `{ inactiveDays, minimiseDays }`.
- Imports `accessService` from `@modules/access` and spies on `holdsStaffRole` to simulate a staff role landing between the reaper's customers-only read and the delete door's own check.
- Uses `createUser` from `@modules/users/tests/factories` to create `'customer'` accounts.
- Uses `setupTestDb` from `@tests/setup-test-db` and `setEnvironment` from `@tests/environment` for database and environment setup.

## Notes
- The grace period in these tests is 30 days. The cases use 31 days for "past grace" and 100 days for the minimise case.
- A dial value of `0` turns that stage off.
- The assertions read the raw driver rather than the app's models, so deleted accounts remain visible.
