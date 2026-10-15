---
source: src/modules/account/tests/integration/reap-inactive.test.ts
sha256: b36774e23d75cb35e8320a3a83bb0b1f4ccd381834ac4ad29baddfd6d5baf327
generated_at: 2026-10-15T10:12:31.621829+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reap-inactive.test.ts

## Purpose

Integration test that exercises the full inactivity-reaper stage sequence (warn → minimise → soft-delete → hard-delete) through the real service and a real database, verifying that exactly one stage advances per run and that each grace period is honoured before the next stage fires.

## Key elements

- **`daysAgo(n)`** — returns a `Date` n days before now; used to backdate accounts.
- **`users()`** — raw Mongoose collection handle (`users`); reads/writes docs without the application model layer so the test can inspect exactly what the reaper persisted.
- **`backdate(id, fields?)`** — sets `createdAt` to 400 days ago (exceeding the 365-day inactivity threshold) and optionally sets extra fields in one `$set`.
- **`stateOf(id)`** — fetches the reaper-relevant fields (`inactivityWarnedAt`, `inactivityMinimisedAt`, `deletedAt`, `deletedBy`) or `null` if the doc was hard-deleted.
- **`describe('reapInactiveAccounts')`** — five cases covering: warn-once idempotency, soft-delete after warning grace, hard-delete after soft-delete grace, minimise on its own dial, and no-op when both dials are `0`.

## Relationships

- **`src/modules/account/services/reap-inactive.ts`** — imports and calls `reapInactiveAccounts`; this is the unit under test.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` to seed test accounts with a given email and role.
- **`tests/support/environment.ts`** — imports `setEnvironment` to force `NODE_MAIL_TRANSPORT: 'outbox'` before each test, preventing real mail delivery.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` (called at module top) to provision a real database connection for the suite.

## Notes

- The file-level docblock states that the candidate list each stage operates on is defined in `users/tests/integration/reaper.test.ts` (a different file), not here.
- `inactiveDays: 0` and `minimiseDays: 0` are the "off" switches; the test uses `365` for the inactivity threshold and `0`/`30` for the minimise dial to isolate each concern.
- All assertions read via the raw collection, not a Mongoose model, so the test is agnostic to model-level virtuals or hooks that might mask the true stored state.
