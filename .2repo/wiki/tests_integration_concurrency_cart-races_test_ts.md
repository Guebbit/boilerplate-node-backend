# tests/integration/concurrency/cart-races.test.ts

## Purpose

Integration tests that exercise concurrent (racy) access to the cart and checkout endpoints, covering two documented bug classes: **R2** (double-checkout producing two orders from one cart, fixed by a conditional `__v`-based cart clear) and **R3** (the cart upsert retry path in `repositories/carts.ts` being completely untested). The file also covers the edge case of account deletion racing a cart write.

## Key elements

- **`describe('R3 — concurrent writes of the SAME product')`** — Fires N concurrent `POST /cart` for one product; asserts exactly one cart, one line, quantity 1, and all participants receive 2xx.
- **`describe('R3 — concurrent adds of DIFFERENT products')`** — Fires N concurrent `POST /cart` for N distinct products; asserts one cart, N lines, no duplicate product IDs. This is the case that distinguishes a working `$ne`-in-filter guard from a broken one.
- **`describe('R3 — concurrent quantity writes to the same line')`** — Pre-creates a line, then races N `PUT /cart/:productId` with distinct quantities; asserts the surviving quantity is one of the sent values (not a merge artefact) and the cart count stays at 1.
- **`describe('R2 — concurrent checkouts of one cart')`** — Five sub-tests: exactly one order created; exactly one 2xx and N−1 409s; cart items emptied to zero; no orphan order for a losing request (loser retracts its order); uncontested checkout still succeeds.
- **`describe('account deletion racing a cart write')`** — Races one `DELETE /account` against three `POST /cart`; asserts no 5xx and that a surviving cart implies a surviving user.

## Relationships

- **`tests/support/race.ts`** — Supplies `raceN` (concurrent request fan-out), `RACE_SIZE`, `countStatus`, and `expectNoServerErrors`; the entire concurrency orchestration depends on this helper.
- **`tests/support/http.ts`** — Provides `api()` (supertest-style client) and `authenticateAs()` (creates a user and returns a bearer token); every HTTP call in the file goes through these.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at the top to provision an isolated test database before the `describe` blocks run.
- **`src/modules/products/tests/factory.ts`** — `createProduct()` creates a product document for each test scenario.
- **`src/modules/cart/model.ts`** — `cartModel` is queried directly (via Mongoose) to assert post-race cart state: document count, item length, item quantities.
- **`src/modules/orders/model.ts`** — `orderModel` is queried directly to assert post-checkout order count and item contents.

## Notes

- The R3 "same product" and "different products" cases look superficially identical (both fire N concurrent adds) but test different invariants. Only the multi-product case can expose a broken `$ne`-in-filter, because a single-product race cannot distinguish "one line appended twice" from "one line appended once."
- Cart upserts use **set** semantics (not increment), so the quantity invariant is "one of the sent values," not a sum. The test comments explicitly warn against asserting a sum.
- The R2 loser-order test asserts the **compensation path**: a checkout that fails the conditional cart clear must delete the order it already wrote. Without this, the order count assertion would still pass (cart is empty) while N orders silently persist.
- The file is intentionally the **reference implementation** for the R3 retry tests that were previously missing; it is not expected to change behavior, only to lock it in.
