---
source: src/modules/wishlist/tests/contract/api.contract.test.ts
sha256: 70a225dcd77395870b6e3d7a5b650231298260f6c8d8d74c206b67cc7922b2ef
generated_at: 2026-09-27T15:46:45.600855+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/wishlist` HTTP surface. They assert that every declared response shape (success and each error branch) is actually reachable over the wire, so the API cannot silently drop a documented response. Behavioural logic lives in the unit suite; this file only verifies the wire contract.

## Key elements

- **`MALFORMED_ID`** (`'not-an-object-id'`) — a string that passes JSON parsing but fails the per-route `ObjectId` check, exercising the 422 malformed-id branch distinct from the 422 invalid-body branch.
- **`authenticateWithWishlist()`** — helper that logs in as `'user'`, creates a product via the products factory, and `POST`s it to `/wishlist`; returns `{ bearer, product }` for subsequent assertions.
- **`GET /wishlist`** — two cases: empty list and list with one item.
- **`POST /wishlist`** — four cases: success, empty body (422), malformed `productId` (422), valid-but-nonexistent `productId` (404).
- **`DELETE /wishlist/{productId}`** — three cases: success (list empty), never-saved id (404), malformed id (422).
- **`POST /wishlist/{productId}/move-to-cart`** — three cases: success (wishlist empty **and** cart reflects the item with quantity 1), never-saved (404), malformed id (422).

## Relationships

- **`tests/support/contract.ts`** — imported for side effects; likely registers contract-aware matchers or assertion helpers.
- **`tests/support/http.ts`** — source of `api()` (HTTP client) and `authenticateAs()` (auth setup) used by every test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module load to provision an in-memory/test database.
- **`tests/support/ids.ts`** — source of `MISSING_ID`, a well-formed ObjectId that does not exist in the DB (exercises 404 branches).
- **`src/modules/products/tests/factories.ts`** — source of `createProduct()`, used to seed a real product the wishlist tests reference.

## Notes

- Two distinct 422 branches exist for `POST /wishlist`: an empty/missing `productId` (body-validation) vs. a syntactically valid string that is not a 24-char hex ObjectId. The test file calls them out explicitly in a comment so they are not accidentally collapsed.
- `MISSING_ID` (valid ObjectId format, absent from DB → 404) and `MALFORMED_ID` (invalid format → 422) are different constants; confusing them would test the wrong branch.
- The `move-to-cart` success case is the only test that crosses into the cart module's endpoint (`GET /cart`) to assert cross-resource consistency.
- All routes require a Bearer token; no anonymous-access case is exercised.
- The response envelope is always `{ data: { items: [...] } }`; tests assert shape via `response.body.data.items` rather than full-body equality.
