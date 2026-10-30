---
source: src/modules/account/tests/integration/reap-inactive.test.ts
sha256: 23bd8f32897acc98828e3b2a2aa11afb5879e2f3cc62d0e18ecbed29a2a41612
generated_at: 2026-10-29T02:59:03.289362+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/reap-inactive.test.ts

## Purpose
Integration test that verifies the inactivity reaper's staged lifecycle — minimise → warn → soft delete → hard delete — enforces correct ordering, respects grace periods between stages, and never advances more than one stage per run. It exercises the real `reapInactiveAccounts` service against a real MongoDB instance.

## Key elements
- **`setupTestDb()`** — called at module top level to spin up a real database for the suite.
- **`setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })`** — run in `beforeEach`; routes any mail the service might send into a safe outbox.
- **`daysAgo(days)`** — returns a `Date` offset into the past by the given number of days.
- **`users()`** — returns the raw Mongoose collection handle (`mongoose.connection.collection('users')`), used to read/reason about state the reaper wrote without going through application models.
- **`backdate(id, fields?)`** — sets `createdAt` to 400 days ago and merges any extra fields (e.g. `inactivityWarnedAt`, `deletedAt`) to simulate elapsed time.
- **`stateOf(id)`** — reads back the reaper-relevant fields (`inactivityWarnedAt`, `inactivityMinimisedAt`, `deletedAt`, `deletedBy`) or returns `null` if the document is gone.
- **`reapInactiveAccounts({ inactiveDays, minimiseDays })`** — the unit under test; `0` on either dial disables that stage.

Test cases:
1. Warns an inactive customer exactly once; a second immediate run is a no-op (grace runs from the warning timestamp).
2. Soft-deletes a warned account whose grace has elapsed; stamps `deletedBy: 'reaper'`.
3. Hard-deletes (removes the document) a reaper soft-delete whose grace has elapsed.
4. Minimises on its own dial (`minimiseDays`) without triggering deletion when the deletion dial is off.
5. Does nothing when both dials are `0`.

## Relationships
- **`src/modules/account/services/reap-inactive.ts`** — the sole system under test; this file imports and calls `reapInactiveAccounts` directly.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` to seed a known account before each scenario.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` to bootstrap the real MongoDB connection the suite reads from.
- **`tests/support/environment.ts`** — provides `setEnvironment` to stub the mail transport so the reaper's warn step doesn't attempt real delivery.

## Notes
- The suite reads DB state through the **raw Mongoose collection** (`mongoose.connection.collection('users')`), not through the user model or service layer. This is intentional: it observes exactly what the reaper persisted, bypassing any virtuals or select projections.
- `inactiveDays: 0` and `minimiseDays: 0` both mean *disabled* for their respective stages; the test suite relies on this convention.
- The module doc-comment references `users/tests/integration/reaper.test.ts` as the source of candidate definitions, but that file is **not** imported here — the candidates are constructed inline via `createUser` + `backdate`.
- No teardown is explicit; `setupTestDb` presumably handles cleanup, but the suite relies on per-test document isolation via distinct emails rather than truncating the collection.
