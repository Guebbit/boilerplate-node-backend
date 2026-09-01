# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/payments` HTTP surface. Each test pins that a specific status-code branch (201, 200, 409, 404, 422, 401) is reachable over HTTP and that the response body satisfies the declared API spec. Business/money logic is intentionally excluded here and lives in the unit suite.

## Key elements

- **`MISSING_ID`** – A syntactically valid ObjectId that is guaranteed absent, used to hit 404 branches (as opposed to 422 for malformed input).
- **`GOOD_CARD`** – The standard test card number (`4242424242424242`) that the fake provider approves.
- **`authenticateWithOrder()`** – Creates a logged-in user, a product (price 10), and a 2-item order; returns the bearer token and order.
- **`authenticateWithIntent()`** – Extends the above by also creating a payment intent via `POST /payments/intent`; returns bearer, order, and the new payment ID.
- **`describe('POST /payments/intent')`** – Verifies 201 (fresh intent), 404 (missing order), 422 (empty body), and 401 (no auth).
- **`describe('POST /payments/{id}/confirm')`** – Verifies 200 (succeeded charge), 409 with `PAYMENT_DECLINED` code, 404 (missing payment), and 422 (invalid card string).
- **`describe('GET /payments/order/{orderId}')`** – Verifies 200 (caller's own payment) and 404 (no intent yet for the order).

## Relationships

- **`tests/support/contract.ts`** – Supplies the `toSatisfyApiSpec()` matcher used on every assertion to validate response shape against the OpenAPI schema.
- **`tests/support/http.ts`** – Supplies the `api()` request helper and `authenticateAs()` for obtaining bearer tokens.
- **`tests/support/setup-test-db.ts`** – Called once at module top level to provision/tear down the test database.
- **`src/modules/products/tests/fixtures.ts`** – `createProduct` builds the product record needed for order setup.
- **`src/modules/orders/tests/fixtures.ts`** – `createOrder` and `toOrderItem` build the order that the payment intent references.
- **`src/modules/payments/providers/fake.ts`** – `FAKE_DECLINE_CARD` is a card number the fake provider rejects, exercising the 409 decline branch without a real gateway.

## Notes

- Every test ends with `expect(response).toSatisfyApiSpec()`, which is the core contract assertion; the explicit status/code checks above it are supplementary readability aids.
- The file deliberately does **not** test amount calculations, idempotency, or retry semantics — those belong to the unit tests.
- `setupTestDb()` runs at import time (top-level call), so the DB is ready before any `describe` block executes.
- The 409 decline test asserts on `errors[0].code === 'PAYMENT_DECLINED'`; if the fake provider's error shape changes, this is the first place to break.
