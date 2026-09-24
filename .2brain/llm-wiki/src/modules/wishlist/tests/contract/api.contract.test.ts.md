---
source: src/modules/wishlist/tests/contract/api.contract.test.ts
sha256: 95d47db4c0b3cf801ee6ce8d1ec16f97e40d3a3a0ab7460c8667d938385c333d
generated_at: 2026-09-23T19:48:43.766684+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every HTTP branch of the `/wishlist` API (GET, POST, DELETE, POST move-to-cart). Each assertion confirms that a declared response shape is actually reachable over a real HTTP call and conforms to the OpenAPI spec. Behavioural logic is intentionally left to the unit suite; this file only proves "the contract is held."

## Key elements

- **`MISSING_ID`** – A syntactically valid ObjectId that is guaranteed not to exist; exercises the **404** branch.
- **`MALFORMED_ID`** (`'not-an-object-id'`) – A string that fails ObjectId parsing; exercises the **422** branch (distinct from the empty-body 422, which never reaches the Mongo-shaped check).
- **`authenticateWithWishlist()`** – Logs in a test user, creates a product via the product factory, and saves it to the wishlist. Returns `{ bearer, product }` for subsequent tests.
- **`describe('GET /wishlist')`** – Asserts empty-wishlist (200, zero items) and populated-wishlist (200, one item) responses satisfy the spec.
- **`describe('POST /wishlist')`** – Covers: valid save (200), empty body (422), malformed `productId` (422), non-existent `productId` (404).
- **`describe('DELETE /wishlist/{productId}')`** – Covers: removing a saved product (200), never-saved product (404), malformed id (422).
- **`describe('POST /wishlist/{productId}/move-to-cart')`** – Covers: successful move (200, wishlist empty, cart now holds the line), never-saved (404), malformed id (422).

## Relationships

- **`tests/support/contract.ts`** – Imported as a side-effect (`import '@tests/contract'`); extends the `expect` matcher with `toSatisfyApiSpec()`, which every test calls to validate the response against the API spec.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is invoked at module top-level before any test runs, ensuring a clean, isolated database per suite.
- **`tests/support/http.ts`** – Provides `api()` (supertest-style HTTP client) and `authenticateAs()` (returns a bearer token for a named test user).
- **`src/modules/products/tests/factories.ts`** – `createProduct()` creates a real product document so the wishlist routes receive a genuine `productId`.

## Notes

- **404 vs 422 are distinct branches.** `MISSING_ID` passes ObjectId parsing but fails the existence check; `MALFORMED_ID` fails parsing itself. The empty-body `{}` 422 short-circuits before the ObjectId check ever runs, so both `MALFORMED_ID` and `{}` tests are needed to cover both 422 sub-branches.
- **`setupTestDb()` is a top-level side-effect call**, not a `beforeAll`. Omitting it silently breaks every test because the DB won't be reset.
- **The move-to-cart test cross-checks `GET /cart`** to confirm the item actually landed in the cart, not just that the wishlist emptied. This is the only test in the file that touches a non-wishlist endpoint.
- All routes require an `Authorization` header; there is no unauthenticated test case.
