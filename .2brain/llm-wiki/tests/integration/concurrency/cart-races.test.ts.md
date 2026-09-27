---
source: tests/integration/concurrency/cart-races.test.ts
sha256: 134315d6cced6c29fb11c4d399e400d77e1f8d8ed6884445aa299a2bff064664
generated_at: 2026-09-27T15:55:28.670736+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/cart-races.test.ts

## Purpose

Integration test suite that exercises two documented concurrency defects in the cart/checkout path: **R2** (unconditional cart-clear at checkout allows double-charge) and **R3** (untested retry/duplicate-key logic in the cart upsert). Each test fires N concurrent HTTP requests against a real database and asserts the resulting DB state, closing or guarding the specific race the header comment names.

## Key elements

- **`describe('R3 — concurrent writes of the SAME product')`** — N parallel `POST /cart` for one product; asserts one cart doc, one line, all callers receive 200/201.
- **`describe('R3 — concurrent adds of DIFFERENT products')`** — N parallel `POST /cart` for N products; asserts one cart with exactly N distinct lines. This is the case that catches a broken `$ne`-in-filter (a single-product race cannot).
- **`describe('R3 — concurrent quantity writes to the same line')`** — N parallel `PUT /cart/:productId`; asserts one cart, one line, and that the surviving quantity is one of the values actually sent.
- **`describe('R2 — concurrent checkouts of one cart')`** — five tests:
  - Exactly one `orderModel` document after N parallel `POST /cart/checkout`.
  - Exactly one success (200/201), the rest 409.
  - Cart emptied to zero items.
  - Loser's pre-written order is retracted (no orphan orders).
  - Loser's product hold is released (`productService.findByIdRaw` → `reserved` equals winner's quantity only).
  - Uncontended checkout still succeeds (guard against the conditional write breaking the happy path).
- **`setupTestDb()`** — called at module scope to reset the database before the suite runs.

## Relationships

- **`tests/support/race.ts`** — provides the concurrency harness: `raceN` fires N promises in parallel, `countStatus` tallies HTTP codes, `expectNoServerErrors` guards against 5xx, and `RACE_SIZE` sets the fan-out count.
- **`tests/support/http.ts`** — `api` (supertest agent) and `authenticateAs` (creates a user, returns bearer token) are used in every test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` wipes and re-seeds the test database before the suite executes.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds a product with configurable `onHand`/`price` for each scenario.
- **`src/modules/products/index.ts` / `src/modules/products/service.ts`** — `productService.findByIdRaw` is called to inspect the `reserved` field after a checkout race, verifying hold-release.
- **`src/modules/cart/model.ts`** — `cartModel` is queried directly (`countDocuments`, `findOne`) to assert cart-document and line-level invariants that HTTP status codes alone cannot verify.
- **`src/modules/orders/model.ts`** — `orderModel` is queried directly to assert order count and line contents after the checkout race.

## Notes

- The header comment is load-bearing: it explains *why* R2 and R3 exist and names the exact fix (`clearLinesIfUnchanged`, conditional on `__v`). New contributors should read it before modifying the tests.
- R3 cases 3 and 4 (same vs. different product) are deliberately separate. The single-product case passes even with a broken `$ne`-in-filter; only the multi-product case exposes the "two lines for one product" failure. Do not merge them.
- The tests assert DB state via Mongoose models (`cartModel`, `orderModel`) rather than relying solely on response bodies. This is intentional: the invariants under test are persistence-level, not presentation-level.
- The "loser retracts its order" test and the "hold is released" test cover two independent compensation steps inside the same code path. Removing either leaves a silent resource leak that the other test does not catch.
- `POST /cart` and `PUT /cart/:productId` both use **set** semantics (not increment). The tests assert "one line, one quantity," not a sum. Asserting a sum would encode semantics the API does not implement.
