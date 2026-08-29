# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three `/payments` routes (`POST /intent`, `POST /{id}/confirm`, `GET /order/{orderId}`). Each test drives a real HTTP request through the app and asserts both the status code and that the response body matches the published API spec (`toSatisfyApiSpec`). The focus is on proving every contract branch is reachable over HTTP; business-logic (money) rules are covered in the unit suite.

## Key elements

- **`MISSING_ID`** – A well-formed ObjectId guaranteed to not exist, used to exercise the 404 path without triggering a 422 validation failure.
- **`GOOD_CARD`** – `'4242424242424242'`, the fake-provider's always-succeed card number.
- **`authenticateWithOrder()`** – Helper that logs in a user, creates a product (price 10) and a 2-item order, returning `{ bearer, order }`.
- **`authenticateWithIntent()`** – Builds on the above; additionally posts `/payments/intent` and returns `{ bearer, order, paymentId }`. Throws a descriptive error if the 201 setup step fails.
- **`describe('POST /payments/intent')`** – Four cases: 201 success, 404 unknown order, 422 invalid body, 401 unauthenticated.
- **`describe('POST /payments/{id}/confirm')`** – Four cases: 200 success, 409 declined card, 404 unknown payment, 422 bad card format.
- **`describe('GET /payments/order/{orderId}')`** – Two cases: 200 with existing intent, 404 when no intent exists yet.

## Relationships

- **`tests/support/contract.ts`** – Imported as `@tests/contract`; registers the `toSatisfyApiSpec()` matcher used by every assertion.
- **`tests/support/http.ts`** – Provides `api()` (the HTTP client) and `authenticateAs()` (session creation).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initializes the in-memory/database fixture before any test runs.
- **`src/modules/products/tests/factory.ts`** – `createProduct` seeds a product for the order.
- **`src/modules/orders/tests/factory.ts`** – `createOrder` and `toOrderItem` seed a valid order the payment attaches to.
- **`src/modules/payments/providers/fake.ts`** – Exports `FAKE_DECLINE_CARD`, the card number the fake provider always declines, used to hit the 409 branch.

## Notes

- Every test ends with `expect(response).toSatisfyApiSpec()`; a passing status-code check alone is insufficient.
- `MISSING_ID` is intentionally a *valid* ObjectId shape so the route returns 404 (resource not found) rather than 422 (malformed input). Swapping it for a garbage string would silently change which branch you are testing.
- The file does **not** test amount math, currency rounding, or retry logic — those are deliberately excluded (see the header comment) and live in the unit suite.
