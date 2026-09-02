# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/payments` HTTP API. Each test sends a real request over HTTP (via the test server) and asserts both the specific status code and that the response body satisfies the OpenAPI spec (`toSatisfyApiSpec()`). The goal is to pin that every contract branch — 201 intent, 200 confirm, the distinguishable 409s, 404s, 422s — is actually reachable and well-shaped. Business/money rules are intentionally out of scope here (they live in the unit suite).

## Key elements

- **`MISSING_ID`** — A syntactically valid ObjectId that is guaranteed to not exist in the test DB, ensuring the 404 branch is hit (not a 422 validation failure).
- **`GOOD_CARD`** (`'4242424242424242'`) — Test card number that the fake provider will approve.
- **`authenticateWithOrder()`** — Sets up a logged-in user with one pending order (product priced 10, qty 2 → amount 20). Returns `{ bearer, order }`.
- **`authenticateWithIntent()`** — Calls `authenticateWithOrder()` then POSTs `/payments/intent` to create a real intent. Returns `{ bearer, order, paymentId }`. Throws a descriptive error if the 201 setup call fails.
- **`describe('POST /payments/intent')`** — 3 tests: happy 201 (amount, status, spec), 404 for nonexistent order, 422 for empty body.
- **`describe('POST /payments/{id}/confirm')`** — 4 tests: 200 success with `GOOD_CARD`, 409 `PAYMENT_DECLINED` with `FAKE_DECLINE_CARD`, 404 for unknown payment ID, 422 for invalid card string.
- **`describe('GET /payments/order/{orderId}')`** — 2 tests: 200 when intent exists, 404 when no intent has been created yet.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`); registers the `toSatisfyApiSpec()` matcher used in every test. |
| `tests/support/http.ts` | Provides `api()` (supertest-style client) and `authenticateAs()` (user login + bearer token). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module load to prepare an in-memory/test database before any test runs. |
| `src/modules/products/tests/fixtures.ts` | `createProduct({ price: 10 })` seeds the product needed to build an order. |
| `src/modules/orders/tests/fixtures.ts` | `createOrder(user, items)` and `toOrderItem(product, qty)` build the pending order that the payment intent references. |
| `src/modules/payments/providers/fake.ts` | Exports `FAKE_DECLINE_CARD`, a card number the fake payment provider is configured to reject with a `PAYMENT_DECLINED` 409. |

## Notes

- **404 vs 422 for bad IDs:** `MISSING_ID` is deliberately a well-formed 24-hex ObjectId. If you replace it with a random string, the route may return 422 (validation) instead of the 404 branch you're trying to pin.
- **Setup errors are thrown, not `fail()`:** `authenticateWithIntent()` uses `throw new Error(...)` rather than a Jest assertion so that a setup failure is clearly distinguishable from a contract assertion failure in stack traces.
- **Auth is universal:** Every route in this module requires a `Bearer` token; the test file never exercises the 401 path (that is presumably covered elsewhere or by the shared contract harness).
- **Amount is hardcoded to 20** in the intent test (price 10 × qty 2). If the fixture changes, the assertion must be updated in lockstep.
