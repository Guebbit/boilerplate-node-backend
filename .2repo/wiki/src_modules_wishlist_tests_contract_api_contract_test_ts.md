# src/modules/wishlist/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/wishlist` routes. Every assertion exists solely to confirm each declared response branch (200, 401, 404, 422) is actually reachable over HTTP and conforms to the API spec. Behavioural logic is covered by the unit suite; this file only checks that the wire surface matches the contract.

## Key elements

- **`MISSING_ID`** – A syntactically valid ObjectId that is guaranteed absent from the DB. Used to exercise the 404 branch without hitting a validation error.
- **`MALFORMED_ID`** – A plain string (`'not-an-object-id'`) that fails the per-route ObjectId check. Used to exercise the 422 branch, which is distinct from the 404 branch.
- **`authenticateWithWishlist()`** – Helper that authenticates a user, creates a product via `createProduct()`, and POSTs it to `/wishlist`. Returns `{ bearer, product }` for use in DELETE and move-to-cart tests.
- **`describe('GET /wishlist')`** – Covers empty wishlist, populated wishlist, and unauthenticated (401).
- **`describe('POST /wishlist')`** – Covers valid save, empty body (422), malformed id (422), missing product (404), and unauthenticated (401).
- **`describe('DELETE /wishlist/{productId}')`** – Covers successful removal, never-saved product (404), malformed id (422), and unauthenticated (401).
- **`describe('POST /wishlist/{productId}/move-to-cart')`** – Covers successful move (verifies wishlist is emptied *and* cart contains the item), never-saved (404), malformed id (422), and unauthenticated (401).

## Relationships

- **`tests/support/contract.ts`** – Provides the `toSatisfyApiSpec()` matcher (imported via `import '@tests/contract'`). Every test asserts the response satisfies the declared API spec.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module level to prepare an isolated database before any test runs.
- **`tests/support/http.ts`** – Supplies `api()` (the HTTP client for making requests) and `authenticateAs()` (obtains a bearer token for a named test user).
- **`src/modules/products/tests/fixtures.ts`** – `createProduct()` creates a product record in the test DB so wishlist routes have a real product id to reference.

## Notes

- The 404 vs 422 distinction is deliberate and non-obvious: `MISSING_ID` passes the shape check but finds no record (404), while `MALFORMED_ID` fails the shape check itself (422). Both are required because each is a separately declared response in the contract.
- The move-to-cart success test issues a second request to `GET /cart` and asserts the cart contains the item — this is a cross-endpoint consistency check, not a pure contract assertion.
- `setupTestDb()` runs at import time (top-level), not inside `beforeAll`/`beforeEach`. Tests are ordered by `describe` blocks and rely on a fresh DB state per suite.
- The empty-body POST test sends `{}`, which triggers a 422 at the body-validation layer; the malformed-id test sends `{ productId: MALFORMED_ID }`, which passes body validation but is rejected by the per-route ObjectId check. These exercise different code paths despite both returning 422.
