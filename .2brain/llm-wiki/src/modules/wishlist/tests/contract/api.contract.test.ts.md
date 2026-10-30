---
source: src/modules/wishlist/tests/contract/api.contract.test.ts
sha256: 4894108374ddf0f66f4d7b42965f9425d7bb5eeb009a66a73b39ac02f51ee131
generated_at: 2026-10-29T06:35:26.420807+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/wishlist` API. Every route returns the same `WishlistResponseEnvelope` shape and requires authentication. The assertions here verify that each **declared** HTTP response (200, 404, 422, 405) is actually reachable over the wire. Business-logic rules are covered by the unit suite, not here.

## Key elements

- **`MALFORMED_ID`** — a string (`'not-an-object-id'`) that cannot parse as an ObjectId. Used to exercise the "invalid id" branch: 404 in a path parameter, 422 in a request body.
- **`authenticateWithWishlist()`** — module-local helper. Authenticates a `user`, creates a product via `createProduct()`, and POSTs it to `/wishlist/items`. Throws if setup fails. Returns `{ bearer, product }`.
- **`describe('GET /wishlist')`** — empty wishlist (200, `items: []`) and populated wishlist (200, one item with `productId` + `availability`).
- **`describe('POST /wishlist/items')`** — happy path (200), idempotency (second save → same 200 + same list), 422 for malformed id / missing field, 404 for non-existent product. Explicitly asserts **no** `Location` header.
- **`describe('DELETE /wishlist/items/{productId}')`** — removal (200, empty list), move-to-cart as `manager`/`moderator`/`admin` (staff use the same wishlist surface), 404 for never-saved or malformed id.
- **`describe('POST /wishlist/items/{productId}/move-to-cart')`** — verifies the wishlist empties **and** the cart (`GET /cart`) contains the line with `quantity: 1`, `canIncrease: true`. 404 branches for missing/malformed id.
- **`describe('the wishlist URLs a line no longer has')`** — `GET /wishlist/items` returns **405** with `Allow: POST`, confirming the collection URL is write-only.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported for side-effect only (`import '@tests/contract'`); sets up contract-test infrastructure (e.g. response-schema enforcement). |
| `tests/support/http.ts` | Provides the `api()` request helper, `authenticateAs()`, and `authenticateAsRole()` used throughout. |
| `tests/support/ids.ts` | Exports `MISSING_ID`, a valid ObjectId that no collection holds, for 404-path tests. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module top-level to prepare a clean test database before any test runs. |
| `src/modules/products/tests/factories.ts` | `createProduct()` creates a real product document so wishlist and cart tests operate on existing data. |

## Notes

- **Path vs. body id errors are different codes.** A malformed id in a URL path is treated as an unknown resource (404); the same value in a `POST /wishlist/items` body is a validation failure (422). Both are intentionally declared responses.
- **`POST /wishlist/items` is idempotent by contract.** It always answers 200 (never 201) and never sends a `Location` header, because a wishlist line is a membership, not a created resource.
- **Staff roles are first-class wishlist users.** The move-to-cart tests iterate over `manager`, `moderator`, and `admin` to lock in that the API does not branch on role for the wishlist surface.
- **Cross-endpoint consistency.** The move-to-cart test reads `GET /cart` after the move to confirm both endpoints agree on the resulting state.
- **The 405 test checks the `Allow` header** (`'POST'`), not just the status code, to pin down the single permitted method on that path.
