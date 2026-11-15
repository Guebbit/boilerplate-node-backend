---
source: src/modules/account/tests/integration/reap-inactive.test.ts
sha256: 5eac5dfae03d081b329d0d0bc6c3808efb3cd19bed46deccb763c36aad7e72cf
generated_at: 2026-11-14T19:07:27.028711+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reap-inactive.test.ts

## Purpose

Integration test for `reapInactiveAccounts` that verifies the staged inactivity lifecycle (minimise → warn → soft-delete → hard-delete) against a real database. It asserts that each stage fires only after the grace period following the prior stage, that no two stages advance in a single run, and that the reaper's own bookkeeping fields (`inactivityWarnedAt`, `inactivityMinimisedAt`, `deletedAt`, `deletedBy`) are written correctly.

## Key elements

- **`daysAgo(days)`** – Returns a `Date` `days` days before now; used to backdate accounts.
- **`users()`** – Returns the raw `users` collection via `mongoose.connection.collection`, letting the suite read exactly what the reaper wrote without going through a model.
- **`backdate(id, fields?)`** – Sets `createdAt` to 400 days ago plus any extra fields (e.g. `inactivityWarnedAt`, `deletedAt`, `deletedBy`) to simulate a prior reaper stage.
- **`stateOf(id)`** – Fetches the four reaper-managed fields from the raw document; returns `null` if the document was hard-deleted.
- **`describe('reapInactiveAccounts')`** – Six tests covering: warn-once semantics, soft-delete after grace, staff-role race between read and delete, hard-delete of a reaper soft-delete, minimise-on-own-dial, and no-op when both dials are off.

## Relationships

- **`src/modules/account/services/reap-inactive.ts`** – The module under test; provides `reapInactiveAccounts({ inactiveDays, minimiseDays })`.
- **`src/modules/access/index.ts`** / **`src/modules/access/services/index.ts`** – Provides `accessService`; its `holdsStaffRole` method is mocked in the race-condition test to simulate a role change landing between the reaper's candidate read and the delete gate.
- **`src/modules/users/tests/factories.ts`** – Supplies `createUser`, the fixture factory for creating test accounts with a given role.
- **`tests/support/environment.ts`** – `setEnvironment` configures `NODE_MAIL_TRANSPORT` to `'outbox'` so no real mail is sent during warns.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises a real MongoDB connection so the suite can inspect raw collection state.

## Notes

- The suite reads collection state through the **raw driver** (`mongoose.connection.collection`) rather than a Mongoose model, specifically to verify the exact field values the reaper persisted and to detect hard deletion (document absent → `null`).
- The module doc-comment references `users/tests/integration/reaper.test.ts` as the source of candidate-selection logic; this file tests only the *stage-ordering* and *grace-period* behavior.
- `backdate` defaults `createdAt` to 400 days ago, which is beyond the `inactiveDays: 365` threshold used in most tests.
- The staff-role race test relies on `jest.spyOn` against `accessService.holdsStaffRole`; `afterEach` calls `jest.restoreAllMocks()` to prevent cross-test leakage.
