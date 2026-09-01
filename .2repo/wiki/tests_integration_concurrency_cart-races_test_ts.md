# tests/integration/concurrency/cart-races.test.ts

## Purpose

Integration tests that fire N concurrent HTTP requests at the cart and checkout endpoints to verify race-condition invariants. Two historical bugs are covered: **R2** (two parallel checkouts both reading the same lines and double-charging) and **R3** (the cart upsert retry logic that was correct but entirely untested). A final case guards against an orphaned cart surviving account deletion.

## Key elements

- **`setupTestDb()`** (top-level) — resets the test database before any suite runs.
- **`describe('R3 — concurrent writes of the SAME product')`** — N parallel `POST /cart` for one product; asserts exactly one cart document with one line.
- **`describe('R3 — concurrent adds of DIFFERENT products')`** — N parallel `POST /cart` for N distinct products; asserts one cart with N unique lines. This is the only case that can detect a broken `$ne`-in-filter (single-product race would look identical to correct behaviour).
- **`describe('R3 — concurrent quantity writes to the same line')`** — N parallel `PUT /cart/:productId` with distinct quantities in *set* mode; asserts the surviving quantity is one of the values actually sent (not a merge artefact).
- **`describe('R2 — concurrent checkouts of one cart')`** — five sub-tests: exactly one order created; losers receive 409; cart emptied to zero items; the losing request's order is retracted (no orphan); uncontended checkout still succeeds.
- **`describe('account deletion racing a cart write')`** — a `DELETE /account` racing three `POST /cart` calls; asserts no orphaned cart survives (dynamic-imports `@modules/users/model` for the cross-check).

## Relationships

- **`tests/support/race.ts`** — supplies `RACE_SIZE`, `raceN`, `countStatus`, and `expectNoServerErrors`, the core primitives for firing N parallel requests and asserting on their status-code distribution.
- **`tests/support/http.ts`** — supplies `api()` (supertest-style HTTP client) and `authenticateAs()` (test user + bearer token).
- **`tests/support/setup-test-db.ts`** — supplies `setupTestDb()` to start each run against a clean database.
- **`src/modules/products/tests/fixtures.ts`** — supplies `createProduct()` to seed the product documents that cart/checkout operations reference.
- **`src/modules/cart/model.ts`** — supplies `cartModel` (Mongoose model) used in assertions to count cart documents and inspect `items`.
- **`src/modules/orders/model.ts`** — supplies `orderModel` (Mongoose model) used in assertions to count orders and inspect their line items.

## Notes

- The file's leading comment documents the R2 fix mechanism: `clearLinesIfUnchanged` performs a conditional `__v`-keyed update so only one concurrent checkout matches; the loser deletes its already-written order and returns 409. Understanding the test expectations requires knowing this two-phase pattern (write order → conditional cart clear → retract on failure).
- Cart upsert uses **set** semantics, not increment. The R3 assertions therefore check for exactly one line / one quantity, never a sum. Asserting a sum would validate semantics the API does not implement.
- The R3 suite is explicitly described as "the tests that were missing" for the retry branch in `repositories/carts.ts` (`attemptsLeft` bound, `isDuplicateKey` check). No production code is changed here; the tests *are* the regression guard.
- The account-deletion test uses a **dynamic `import('@modules/users/model')`** inside the assertion to avoid a hard dependency on the users module at the top of the file.
- `RACE_SIZE` is imported from the shared race helper; its value is not defined in this file.
