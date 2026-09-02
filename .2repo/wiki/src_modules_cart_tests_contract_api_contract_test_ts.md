# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose

Contract tests for all six `/cart` endpoints. Every route returns the same `CartResponseEnvelope` shape, making serialization drift easy to hide; these tests assert each response (success and error) against the OpenAPI spec via `toSatisfyApiSpec()`. Cart state is built through real API calls rather than a fixture builder because `CartResponse` is a computed view, not a direct serialization of a stored document.

## Key elements

- **`MISSING_ID`** — A syntactically valid ObjectId guaranteed not to exist; used to exercise the 404 branch specifically (as opposed to the 422 "malformed id" branch).
- **`authenticateWithCart(quantity?)`** — Helper that authenticates as `user`, creates a product, and `POST /cart`s it, returning `{ bearer, product }`. Used by most tests to seed a non-empty cart.
- **`describe` blocks** — One per endpoint: `GET /cart`, `POST /cart`, `DELETE /cart`, `DELETE /cart/all`, `PUT /cart/{productId}`, `DELETE /cart/{productId}`, `GET /cart/summary`, `POST /cart/checkout`. Each covers the happy path plus every declared error branch (404, 422, 409).
- **`setupTestDb()`** — Resets the database before the suite runs.

## Relationships

- **`tests/support/contract.ts`** — Provides the `toSatisfyApiSpec()` (and `toSatisfyA...`) matchers that validate responses against the OpenAPI spec.
- **`tests/support/http.ts`** — Supplies `api()` (supertest-style client) and `authenticateAs()` used to build and authenticate every request.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` tears down and re-seeds the test database before the suite.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct()` builds real catalogue rows (including inactive products for the "outside public catalogue" 404 cases).
- **`src/modules/orders/tests/fixtures.ts`** — `createOrder`, `toOrderItem` imported (used in the checkout-creates-order assertions).
- **`src/modules/users/tests/fixtures.ts`** — `createUser()` creates the authenticated test user.

## Notes

- The cart is always populated via `POST /cart` in these tests, never via a direct DB fixture, because `CartResponse` is a computed view (joins, pricing, stock checks) that a hand-written fixture cannot faithfully represent.
- `DELETE /cart` (single-item remove) is distinguished from `DELETE /cart/all` (clear all) by requiring `productId` in the body; the 422 test for a missing body documents this contract difference.
- The 409 on `POST /cart/checkout` for an empty cart was **not** originally declared in the OpenAPI spec; the comment notes it was added when this suite was written. The implementation had always returned 409.
- The insufficient-stock 409 asserts `errors[0].details.lines` (an array of `{ productId, title, requested, available }`) riding the spec's `additionalProperties: true` on `ErrorItem.details` rather than requiring a new schema type.
- The "outside public catalogue" 404 tests create a real product with `active: false`; the comment clarifies this is a scope-level 404, not an ID-matching 404.
- File is truncated in the provided content; the last visible assertion in the stock-409 test is `expect(response).toSatisfyA…` (likely `toSatisfyApiSpec()`).
