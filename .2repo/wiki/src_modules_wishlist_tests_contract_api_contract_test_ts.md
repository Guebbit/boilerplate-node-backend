# src/modules/wishlist/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the four `/wishlist` routes (`GET`, `POST`, `DELETE /{productId}`, `POST /{productId}/move-to-cart`). Each test hits the live HTTP surface and asserts the response matches the declared API spec, ensuring every documented response branch (200, 404, 422) is actually reachable. Behavioural logic is explicitly out of scope here—that belongs in the unit suite.

## Key elements

- **`MISSING_ID`** — a syntactically valid ObjectId that is guaranteed absent from the DB; exercises the 404 branch.
- **`MALFORMED_ID`** — a string that cannot be parsed as an ObjectId (`'not-an-object-id'`); exercises the 422 branch.
- **`authenticateWithWishlist()`** — helper that authenticates a user, creates a product, POSTs it to `/wishlist`, and returns `{ bearer, product }`. Throws a descriptive error if setup fails.
- **`describe('GET /wishlist')`** — two cases: empty wishlist (items array is `[]`) and one saved item.
- **`describe('POST /wishlist')`** — four cases: valid save, empty body (422), malformed id (422), nonexistent product id (404).
- **`describe('DELETE /wishlist/{productId}')`** — three cases: remove saved item, never-saved id (404), malformed id (422).
- **`describe('POST /wishlist/{productId}/move-to-cart')`** — three cases: move saved item (also asserts the item now appears in `GET /cart`), never-saved id (404), malformed id (422).

## Relationships

- **`tests/support/contract.ts`** — imported via `@tests/contract`; registers the `toSatisfyApiSpec()` matcher used in every assertion to validate the response against the OpenAPI/contract spec.
- **`tests/support/http.ts`** — provides `api()` (HTTP client builder) and `authenticateAs(user)` (returns a bearer token) used throughout every test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to seed/reset the test database before any test runs.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct()` is used to generate a real product in the test DB so wishlist POST/DELETE/move-to-cart have a valid `productId` to reference.

## Notes

- The 404 and 422 branches are deliberately separate tests: 404 requires a *valid* ObjectId that simply doesn't exist, while 422 requires a *malformed* string. The inline comment in the POST suite explicitly calls out that the empty-body test never reaches the ObjectId-validation branch.
- The `move-to-cart` success test cross-checks `GET /cart` to confirm the item actually landed in the cart, not just that the wishlist emptied.
- Every assertion ends with `expect(response).toSatisfyApiSpec()`—the structural contract check. The earlier status/array-length assertions are supplementary and will be caught by the spec check if the shape is wrong, but they make failure messages more readable.
