---
source: src/modules/wishlist/tests/contract/api.contract.test.ts
sha256: 409317e907f61fe93794e80e4b63d805b8e8d018a957cbcf14319fe70aaa3c0c
generated_at: 2026-11-14T22:54:36.169172+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/contract/api.contract.test.ts

## Purpose

Contract (integration) tests for the `/wishlist` HTTP API. They verify that every route answers with the correct status code, response envelope shape, and headers over a real HTTP call, ensuring each contract branch is actually reachable. Behavioural/logic rules are intentionally left to the unit suite; this file only guards the wire-level agreement.

## Key elements

- **`authenticateWithWishlist()`** — local helper: logs in as `user`, creates a product, POSTs it to `/wishlist/items`, and returns `{ bearer, product }` for reuse across tests.
- **`describe('GET /wishlist')`** — asserts 200 + empty `items` array for a fresh account; asserts 200 + one `{ productId, availability: 'in_stock' }` entry after a save.
- **`describe('POST /wishlist/items')`** — covers successful save (200, not 201; no `Location` header), idempotency (re-save returns identical 200 + list), 422 on missing `productId`, and 404 on a non-existent product ID.
- **`describe('DELETE /wishlist/items/{productId}')`** — covers removal (200, empty list), `move-to-cart` for each staff role (`manager`, `moderator`, `admin`), and 404 for an unsaved product.
- **`describe('POST /wishlist/items/{productId}/move-to-cart')`** — asserts the wishlist empties *and* the cart (`GET /cart`) shows the line with `quantity: 1`, `canIncrease: true`; also 404 for an unsaved product.
- **`describe('the wishlist URLs a line no longer has')`** — asserts `GET /wishlist/items` returns **405** with `Allow: OPTIONS, POST`, confirming the collection read lives at `GET /wishlist`.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); likely registers global contract-test matchers or conventions used implicitly by the suite.
- **`tests/support/http.ts`** — source of `api()` (supertest-style HTTP client), `authenticateAs()`, and `authenticateAsRole()` used by every test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision and clean the test database before/after the suite.
- **`tests/support/ids.ts`** — provides the `MISSING_ID` sentinel used in 404-path tests (POST and DELETE with a non-existent product ID).
- **`src/modules/products/tests/factories.ts`** — provides `createProduct()` to generate a real product document in the test DB so wishlist items can reference a valid `productId`.

## Notes

- The file explicitly states the wishlist uses the **same single-shape envelope** as the cart (`WishlistResponseEnvelope`); assertions mirror that shape rather than introducing a separate schema.
- `POST /wishlist/items` is contractually **200, idempotent, no `Location`** — a deliberate departure from REST 201 convention, and a test exists specifically to lock that in.
- Staff roles (`manager`, `moderator`, `admin`) are exercised via `it.each` to confirm `move-to-cart` works for every signed-in role, not just `user`.
- `@tests/contract` is imported for its side-effects only; no named binding is destructured, so its exports are consumed by the test runner globally.
