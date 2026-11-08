---
source: tests/integration/journeys/quiet-for-three-years.test.ts
sha256: e02cb8b4741a09da787fb5e0dd1a5b0f8a6d48f13912af7bb7acf80dc3612e9e
generated_at: 2026-11-08T09:40:35.137306+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/quiet-for-three-years.test.ts

## Purpose

End-to-end journey test that verifies the staged inactivity lifecycle of user accounts (minimise → warn → deactivate → delete). It confirms that each stage is reversible until the final hard-delete, that the correct modules (addresses, orders, wishlist, users, signup) react at each stage, and that staff accounts are never swept while they keep signing in.

## Key elements

- **`it('lets go in stages, with a way back until the last')`** — the single test. Creates three shoppers with wishlist items and orders, then advances the clock in four jumps (1096 d, 365 d, 31 d, 31 d) running `reap:inactive-accounts` after each. Asserts the job result counters, mail delivery, login success/failure, data retention, and that a hard-deleted email can re-sign-up.
- **`NOTHING`** — `{ minimised: 0, warned: 0, softDeleted: 0, hardDeleted: 0 }`; the zero-state spread into each `toEqual` expectation.
- **`staffNow()`** (closure inside the test) — re-authenticates the admin via `loginBearer` after each time jump, because every account ages and sessions expire.
- **`beforeEach`** — enables outbox mail and sets `NODE_INACTIVE_ACCOUNT_DAYS=1460` so minimising (1095 d) and hard-deletion are both active.
- **`afterEach`** — restores real timers (`jest.useRealTimers()`).

## Relationships

- **`@tests/setup-test-db`** — `setupTestDb()` initialises a clean DB per test.
- **`@tests/http`** — `api()`, `authenticateAs('admin')`, `loginBearer()` drive all HTTP interactions and re-authentication.
- **`@tests/clock`** — `freezeDate()` / `advanceDate()` control time; the test never uses real wall-clock.
- **`@tests/drain`** — `runJob('reap:inactive-accounts')` triggers the reaper; `drain()` flushes async side-effects (mail) before assertions.
- **`@tests/environment`** — `setEnvironment` sets the inactivity-threshold env vars.
- **`@tests/journey-mail`** — `useOutboxMail()` intercepts mail; `mailsTo(email, subject)` asserts delivery counts.
- **`@tests/journey-orders`** — `newShopper()` creates a user with orders; `placeOrder` records a purchase.
- **`@tests/body-of`** — `bodyOf(res, Schema)` extracts a Zod-validated body from a response.
- **`@tests/contract`** — imported for side effects (API contract/schema registration).
- **`@modules/products/tests/factories`** — `createProduct` supplies a concrete product for wishlist and order fixtures.
- **`@modules/users/tests/factories`** — `PLAIN_PASSWORD` is the known password used in the 401 and re-signup assertions.

## Notes

- The test is deliberately a *cross-module* integration check; individual stage rules (e.g. exactly what "minimise" removes) are covered by dedicated unit tests.
- `drain()` must be called after `runJob` and before any mail assertion — mail is sent asynchronously by the job.
- The 401 assertion on the soft-deleted user uses `PLAIN_PASSWORD` directly (not a bearer) to prove the credential is rejected, not just the session.
- `NODE_INACTIVE_ACCOUNT_DAYS=1460` (4 years) is chosen so that the 1095-day minimisation threshold is already exceeded at the first jump but hard-deletion (1460 d) is not, giving the test its four distinct stages.
