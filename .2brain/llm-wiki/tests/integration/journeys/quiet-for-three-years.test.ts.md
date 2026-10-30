---
source: tests/integration/journeys/quiet-for-three-years.test.ts
sha256: 3cc5d6ae601935e4ecf735cefccac8dfb1452a521ee5f12f0e60be248dde7cec
generated_at: 2026-10-29T06:57:16.295891+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/quiet-for-three-years.test.ts

## Purpose

Integration test for the staged inactivity lifecycle: an account that goes quiet is progressively minimised, warned, deactivated, and finally deleted. It verifies that each stage is reversible until the last, that active staff are never swept, and that a fully deleted user can re-register. It asserts the chain across multiple modules (addresses, orders, wishlist, users, signup) rather than re-testing each stage's own rule.

## Key elements

- **`setupTestDb()`** — initialises a fresh database for the test.
- **`beforeEach` / `afterEach` hooks** — switch to outbox mail, set `NODE_INACTIVE_ACCOUNT_DAYS` to `1460` so all four stages fire within the test window, and restore real timers.
- **`DAY_MS`** — constant for one day in milliseconds; used as the unit for time advances.
- **`NOTHING`** — `{ minimised: 0, warned: 0, softDeleted: 0, hardDeleted: 0 }`; the expected "no-op" result shape from `reap:inactive-accounts`.
- **`it('lets go in stages, with a way back until the last')`** — the single test. Creates three shoppers and one admin, gives each shopper a wishlist item and an order, then advances the clock in four jumps (≈1096 d → +365 d → +31 d → +31 d). At each jump it runs the reap job, checks the result counts, verifies mail delivery, confirms the expected data is retained or gone, and asserts re-login / re-signup where applicable.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` prepares and tears down the test database.
- **`tests/support/clock.ts`** — `freezeDate()` pins the clock at start; `advanceDate(ms)` moves it forward between stages.
- **`tests/support/http.ts`** — `api()` returns a supertest agent; `authenticateAs('admin')` and `loginBearer(email)` obtain bearer tokens for staff/shoppers.
- **`tests/support/body-of.ts`** — `bodyOf(response, ZodSchema)` parses and type-checks a response body against the schema from `@api/schemas.zod`.
- **`tests/support/drain.ts`** — `runJob(name)` executes a scheduled job (here `reap:inactive-accounts`) and returns its result; `drain()` flushes queued side-effects (mail, etc.) before assertions.
- **`tests/support/environment.ts`** — `setEnvironment()` overrides process-level config (the inactivity-day threshold) for the test run.
- **`tests/support/journey-mail.ts`** — `useOutboxMail()` captures outgoing mail in-memory; `mailsTo(email, template)` filters captured mail for assertions.
- **`tests/support/journey-orders.ts`** — `newShopper()` registers a fresh user and returns credentials; `placeOrder(bearer, items)` creates an order for that user.
- **`tests/support/contract.ts`** — imported for side-effects (likely enables global contract/HTTP validation middleware).
- **`src/modules/users/tests/factories.ts`** — `PLAIN_PASSWORD` is the known plaintext password used for login assertions.
- **`src/modules/products/tests/factories.ts`** — `createProduct({ price, onHand })` seeds a sellable product for the wishlist and order steps.

## Notes

- **Clock is monotonic.** Because sessions expire after one day and every account ages with the clock, the test must re-authenticate the admin (`staffNow()`) after every `advanceDate` call to keep a valid session.
- **`NODE_INACTIVE_ACCOUNT_DAYS = 1460`** is deliberately set so the four stages (minimise at 1095 d, warn at 1460 d, deactivate, hard-delete) all fall within the test's total elapsed time (~1523 d).
- **`drain()` must be called after `runJob`** before asserting on `mailsTo`; the mail is queued by the job and only dispatched on drain.
- The test is a single `it` block with sequential time jumps — there is no parallelism or isolation between stages within the test.
- `@api/schemas.zod` is imported for the four response schemas used with `bodyOf`; it is not a graph neighbor in the listed dependencies but is a compile-time import.
