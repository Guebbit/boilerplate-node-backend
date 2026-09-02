# tests/integration/concurrency/cart-races.test.ts

## Purpose

Integration tests that fire N concurrent HTTP requests against the cart and checkout endpoints to verify that the optimistic-concurrency guards actually prevent the two documented failure modes: **R2** (two parallel checkouts both read the same cart lines, both create an order, and the customer is charged twice) and **R3** (parallel cart upserts produce duplicate lines or duplicate cart documents). Also covers an edge race where account deletion and a cart write interleave.

## Key elements

- **`describe('R3 — concurrent writes of the SAME product')`** — N parallel `POST /cart` calls with one product; asserts exactly one cart document and one line.
- **`describe('R3 — concurrent adds of DIFFERENT products')`** — N parallel `POST /cart` calls with N distinct products; asserts one cart with N unique lines. This is the case that actually distinguishes a working `$ne`-in-filter upsert from a broken one.
- **`describe('R3 — concurrent quantity writes to the same line')`** — N parallel `PUT /cart/:productId` calls (set, not increment); asserts the surviving quantity is one of the values sent, not a merge artefact.
- **`describe('R2 — concurrent checkouts of one cart')`** — N parallel `POST /cart/checkout` calls; asserts exactly one order, one 2xx and N−1 409 responses, cart emptied to zero items, no orphaned order, and no leaked product hold (`reserved` equals only the winner's quantity). Also includes a single uncontended checkout regression check.
- **`describe('account deletion racing a cart write')`** — one `DELETE /account` racing three `POST /cart` calls; asserts no orphaned cart and no 5xx.
- **`setupTestDb()`** — called once at module scope before all suites; resets the test database.

## Relationships

- **`tests/support/race.ts`** — provides `raceN` (fires N promises in parallel and collects results), `RACE_SIZE` (concurrency constant), `countStatus` (tallies HTTP status codes), and `expectNoServerErrors`.
- **`tests/support/http.ts`** — provides the `api()` supertest wrapper and `authenticateAs()` which returns a user record and bearer token for each test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` seeds and resets the test MongoDB instance.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct()` creates a product document for each test scenario.
- **`src/modules/products/index.ts`** — re-exports `productRepository`, used to read the `reserved` field after R2 races to verify holds were released.
- **`src/modules/products/repository.ts`** — `findByIdRaw` gives direct document access to assert the `reserved` count without going through an HTTP endpoint.
- **`src/modules/cart/model.ts`** — `cartModel` is queried directly to assert cart document count, line count, and line contents after each race.
- **`src/modules/orders/model.ts`** — `orderModel` is queried to assert order count, item quantity, and absence of phantom orders.

## Notes

- `POST /cart` and `PUT /cart/:productId` both **set** quantity (not increment). The invariant under test is "one line per product," never "the sum of all sends." The `add` mode in `upsertLine` is exercised only by the unit suite, not by any route.
- The same-product race (case 3) and the different-products race (case 4) look similar but test different invariants. Removing the `$ne`-in-filter guard would only be caught by the multi-product case; the single-product case would pass even with the broken design.
- In R2, the losing request has already created an order document before the conditional cart-clear fails. The test for "no orphaned order" specifically verifies the compensation (`retractOrder`) ran. A separate test verifies the product `reserved` hold is also released, since `reserveForOrder` was called before the race was lost.
- The 409 error code on the loser response is `CART_CHANGED`, asserted explicitly in the hold-leak test.
- `setupTestDb()` runs at module import time, not inside a `beforeEach`, so the entire file shares one clean database state.
