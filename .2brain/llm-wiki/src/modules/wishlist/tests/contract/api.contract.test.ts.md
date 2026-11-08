---
source: src/modules/wishlist/tests/contract/api.contract.test.ts
sha256: 4894108374ddf0f66f4d7b42965f9425d7bb5eeb009a66a73b39ac02f51ee131
generated_at: 2026-11-08T09:14:32.482122+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/contract/api.contract.test.ts

## Purpose

HTTP contract tests for every `/wishlist` route. Each test drives a real request through the API and asserts the declared response (status, body shape, headers) is actually produced, so a declared contract branch that no handler reaches would fail here. Behavioural logic is covered by the unit suite; this file only guarantees the wire surface.

## Key elements

- **`MALFORMED_ID`** – a string (`'not-an-object-id'`) that cannot parse as an ObjectId. Used to verify 422 in a request body and 404 in a URL path.
- **`authenticateWithWishlist`** – shared helper: logs in as `user`, creates a product, and POSTs it to `/wishlist/items`; returns `{ bearer, product }` for downstream assertions.
- **`describe('GET /wishlist')`** – 200 with empty `items[]`; 200 with a single `{ productId, availability }` entry.
- **`describe('POST /wishlist/items')`** – happy path (200, not 201, no `Location`), idempotency (re-save returns identical list), 422 for malformed/missing `productId`, 404 for a valid-but-absent id.
- **`describe('DELETE /wishlist/items/{productId}')`** – removal returns 200 + empty list; 404 for absent/malformed ids; parameterised test confirming `manager`/`moderator`/`admin` can also save and delete.
- **`describe('POST /wishlist/items/{productId}/move-to-cart')`** – verifies the wishlist empties *and* `GET /cart` reflects the new line with `quantity: 1`; 404s for absent/malformed ids.
- **`describe('the wishlist URLs a line no longer has')`** – `GET /wishlist/items` returns **405** with `Allow: POST`, locking in that the collection endpoint is write-only.

## Relationships

- **`tests/support/contract.ts`** – side-effect import (`@tests/contract`); registers global contract-test matchers or setup used across the suite.
- **`tests/support/http.ts`** – supplies `api()` (HTTP client), `authenticateAs(role)`, and `authenticateAsRole(role)` for every request in this file.
- **`tests/support/ids.ts`** – exports `MISSING_ID`, a well-formed ObjectId that matches no document, used to exercise the 404 "not found" branch.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to seed/reset the test database before any test runs.
- **`src/modules/products/tests/factories.ts`** – `createProduct()` creates a real product document so wishlist operations have a valid `productId` to reference.

## Notes

- Two distinct "bad id" cases are exercised: `MALFORMED_ID` (bad shape → 422 in body, 404 in path) vs. `MISSING_ID` (good shape, no document → 404). Conflating them would mask a validation gap.
- `POST /wishlist/items` is intentionally **idempotent** (always 200, same list); the test asserts the absence of `Location` to prevent accidental 201 regressions.
- Staff roles are first-class wishlist users in this suite (the `move-to-cart` parameterised test); if the API ever restricts wishlist to `user` only, that test is the one that breaks.
- The 405/`Allow` assertion on `GET /wishlist/items` is a deliberate contract pin: it prevents a future route handler from silently accepting that GET without updating the declared contract.
