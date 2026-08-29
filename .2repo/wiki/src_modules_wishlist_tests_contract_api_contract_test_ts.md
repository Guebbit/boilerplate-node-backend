# src/modules/wishlist/tests/contract/api.contract.test.ts

## Purpose

Contract tests that exercise every `/wishlist` route over HTTP and assert each response satisfies the declared API spec. Unlike the unit suite (which verifies business logic), these tests exist to guarantee every declared response branch—success, 401, 404, 422—is actually reachable and correctly shaped for the four routes: `GET /wishlist`, `POST /wishlist`, `DELETE /wishlist/{productId}`, and `POST /wishlist/{productId}/move-to-cart`.

## Key elements

- **`MISSING_ID`** — A syntactically valid ObjectId with no matching record; drives the 404 branch.
- **`MALFORMED_ID`** — A plain non-ObjectId string; drives the 422 branch (distinct from the empty-body 422).
- **`authenticateWithWishlist()`** — Helper that authenticates a user, creates a product, and saves it to the wishlist; returns `{ bearer, product }` for tests that need a populated wishlist.
- **`describe('GET /wishlist')`** — Empty wishlist (200), populated wishlist (200), unauthenticated (401).
- **`describe('POST /wishlist')`** — Valid save (200), empty body (422), malformed id (422), non-existent product (404), unauthenticated (401).
- **`describe('DELETE /wishlist/{productId}')`** — Remove saved item (200), never-saved item (404), malformed id (422), unauthenticated (401).
- **`describe('POST /wishlist/{productId}/move-to-cart')`** — Successful move (200, item removed from wishlist *and* present in cart), never-saved (404), malformed id (422), unauthenticated (401).

## Relationships

- **`tests/support/contract.ts`** — Imported as a side-effect (`import '@tests/contract'`); registers the `toSatisfyApiSpec()` jest matcher used in every assertion.
- **`tests/support/http.ts`** — Supplies `api()` (Supertest-style HTTP client) and `authenticateAs()` (bearer-token helper).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to prepare/seed the test database before any test runs.
- **`src/modules/products/tests/factory.ts`** — Provides `createProduct()` to fabricate a real product record for wishlist-save and move-to-cart scenarios.

## Notes

- **404 vs 422 are distinct branches.** `MISSING_ID` is a well-formed ObjectId that simply has no match; `MALFORMED_ID` fails the ObjectId parse check. Each is a separate declared response and gets its own test.
- **`setupTestDb()` runs at import time**, not inside `beforeAll`. Importing the module is what makes the DB ready.
- **The move-to-cart test cross-checks `GET /cart`** to confirm the item landed in the cart with `quantity: 1`, guarding against a "removed from wishlist" response that silently dropped the item.
- **Structure mirrors the cart contract suite** (noted in the file header). If conventions change for cart, they should change here in lockstep.
