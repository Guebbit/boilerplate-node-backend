---
source: src/modules/account/tests/integration/reap-inactive.test.ts
sha256: 23bd8f32897acc98828e3b2a2aa11afb5879e2f3cc62d0e18ecbed29a2a41612
generated_at: 2026-11-08T04:40:38.656377+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reap-inactive.test.ts

## Purpose

Integration tests for `reapInactiveAccounts` that verify the staged inactivity lifecycle (minimise → warn → soft-delete → hard-delete) against a real MongoDB instance. Each stage fires only after its own grace period elapses, and the suite asserts that no single run advances an account more than one stage.

## Key elements

- **`setupTestDb()`** – initialises the test database before the suite runs.
- **`daysAgo(n)`** – returns a `Date` n days in the past; used to backdate accounts.
- **`users()`** – returns the raw Mongoose `users` collection (bypasses service layer) so tests can read and seed reaper fields directly.
- **`backdate(id, fields)`** – sets `createdAt` to 400 days ago plus any extra fields the test case needs (e.g. `inactivityWarnedAt`, `deletedAt`).
- **`stateOf(id)`** – reads the reaper-relevant fields (`inactivityWarnedAt`, `inactivityMinimisedAt`, `deletedAt`, `deletedBy`) off an account; returns `null` if the document is gone.
- **`beforeEach`** – sets `NODE_MAIL_TRANSPORT` to `'outbox'` so no real mail is sent.
- **Five `it` blocks** covering: warn-once with no same-run deletion; soft-delete after warning grace; hard-delete after soft-delete grace; minimisation on its own dial; and no-op when both dials are `0`.

## Relationships

- **`src/modules/account/services/reap-inactive.ts`** – imports and exercises `reapInactiveAccounts`, the function under test.
- **`src/modules/users/tests/factories.ts`** – provides `createUser` to seed a valid account in the test DB.
- **`tests/support/environment.ts`** – provides `setEnvironment` to switch mail transport to the outbox.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb` for test-database initialisation and teardown.

## Notes

- The suite reads and writes account state through the **raw Mongoose collection** (`mongoose.connection.collection('users')`) rather than through service-layer methods, so it observes exactly what the reaper persisted.
- "Dials" are the `inactiveDays` (warn/soft/hard) and `minimiseDays` (minimise) parameters passed to `reapInactiveAccounts`. Most tests set `minimiseDays: 0` to isolate the warn → soft → hard chain.
- Grace periods in the tests are 31 days (e.g. warning 31 days ago triggers soft-delete), matching the production default rather than being arbitrary.
- The module doc-comment cross-references `users/tests/integration/reaper.test.ts` for the candidate-selection tests; this file focuses solely on stage ordering and idempotency.
