# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose

Contract tests for all six `/cart` endpoints. Each test makes a real HTTP call and asserts that the response envelope matches the declared API spec (`toSatisfyApiSpec`). The cart is deliberately built through API calls (not a factory) because `CartResponse` is a computed view over stored lines and live product prices, not a serialization of the cart document. Behavioural logic (whose cart, which products are valid) is covered in the service suites; these tests exist to pin the wire format.

## Key elements

- **`MISSING_ID`** – A well-formed ObjectId guaranteed to have no matching document; exercises the 404 branch (as opposed to 422 for a malformed id).
- **`authenticateWithCart(quantity?)`** – Local helper that authenticates a user, creates a product, and POSTs it into the cart via the API; returns `{ bearer, product }`.
- **`describe('GET /cart')`** – Empty cart, cart with items, unauthenticated (401).
- **`describe('POST /cart')`** – Add item (200), invalid body (422), non-existent product (404), inactive product (404 via scope), unauthenticated (401).
- **`describe('DELETE /cart')`** – Clear all items, remove one product via request body, unauthenticated.
- **`describe('PUT /cart/{productId}')`** – Set quantity, invalid quantity (422), non-existent product (404), inactive product (404), unauthenticated.
- **`describe('DELETE /cart/{productId}')`** – Remove one item (200), malformed id (422), unauthenticated.
- **`describe('GET /cart/summary')`** – Empty cart, cart with items, unauthenticated.
- **`describe('POST /cart/checkout')`** – Success (201) and cart-emptied assertion, empty-cart conflict (409), insufficient stock, unauthenticated.

## Relationships

- **`tests/support/contract.ts`** – Provides the `toSatisfyApiSpec()` expectation matcher used on every assertion.
- **`tests/support/http.ts`** – Provides `api()` (supertest wrapper) and `authenticateAs(role)` used for all requests and auth setup.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to ensure a clean test database.
- **`src/modules/products/tests/factory.ts`** – `createProduct()` creates the product rows needed for cart operations.
- **`src/modules/orders/tests/factory.ts`** – `createOrder` / `toOrderItem` are imported (used in the truncated portion of the suite, likely for checkout-related fixtures).
- **`src/modules/users/tests/factory.ts`** – `createUser` is imported (likely consumed by `authenticateAs` or the truncated section).

## Notes

- **409 vs 422 on empty-cart checkout:** An empty cart at checkout returns **409** (state conflict), not 422. The API spec was updated to declare this when this suite was written; the implementation had always returned 409.
- **404 ambiguity on `POST /cart`:** Two distinct 404 cases are tested: a nonexistent id (scope returns "not found") vs. an inactive product (valid id, but scope filters it out). The test for the latter creates a real row with `active: false`.
- **PUT 404 origin:** The 404 on `PUT /cart/{productId}` is gated by `cartItemSetById`, not by the route handler itself — noted in an inline comment to prevent confusion when reading the service layer.
- **No factory for cart state:** The file intentionally avoids a cart factory; all cart state is created through `POST /cart` over HTTP so the response shape is the one the application actually produces.
