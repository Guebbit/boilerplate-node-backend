---
source: src/modules/cart/tests/contract/api.contract.test.ts
sha256: 7f85970808963fb20e723cf38d98c7e1175bc9baaa2c8a6978af01f78b7e9fde
generated_at: 2026-09-27T14:47:28.246669+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose

Contract tests for all six `/cart` endpoints. Each test verifies that a real API response (success or error) satisfies the declared OpenAPI spec via `toSatisfyApiSpec()`. The cart is built exclusively through API calls—never through a fixture builder—because `CartResponse` is a computed view, not a direct serialization of a stored document, so a hand-written fixture would assert a shape the application never produces.

## Key elements

- **`authenticateWithCart(quantity?)`** — Local helper: authenticates a user, creates a product, adds it to the cart via `POST /cart`, and returns `{ bearer, product }`. Used by most test cases to establish a non-empty cart.
- **`describe('GET /cart')`** — Two cases: empty cart and cart with one item; both must return 200 and satisfy the spec.
- **`describe('POST /cart')`** — Add item (200), non-existent product (404), and inactive product (404 via SCOPE).
- **`describe('DELETE /cart')`** — Body-based single-item removal (200, remaining items intact), missing body (422), product not in cart (404).
- **`describe('DELETE /cart/all')`** — Full cart clear (200, zero items).
- **`describe('PUT /cart/{productId}')`** — Set quantity (200), invalid quantity 0 (422), non-existent product (404), inactive product (404).
- **`describe('PUT /cart/shipping-method')`** — Set method (200), clear with `null` (200, `shippingMethodId` undefined), unknown method (404), digital-only basket (409), over-weight basket (409), malformed body (422).
- **`describe('DELETE /cart/{productId}')`** — Path-param removal (200) and its error branches.

## Relationships

- **`tests/support/contract.ts`** — Side-effect import (`@tests/contract`) that registers the `toSatisfyApiSpec()` matcher used by every assertion.
- **`tests/support/http.ts`** — Provides `api()` (supertest-style request builder) and `authenticateAs('user')` (returns a bearer token).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once at module level to provision a clean test database.
- **`tests/support/ids.ts`** — Exports `MISSING_ID`, a well-formed but non-existent identifier used to trigger 404 "not found" branches.
- **`tests/support/environment.ts`** — Exports `withEnvironment` / `withoutEnvironment` (imported for environment-scoped test setup; visible in the import list).
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds catalogue rows (active, inactive, digital-only, heavy-weight variants) used as cart contents.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` (imported; likely used in truncated portion or reserved for order-related cart assertions).
- **`src/modules/users/tests/factories.ts`** — `createUser` (imported; user seeding for authentication).

## Notes

- **Three distinct removal routes:** `DELETE /cart` (body-based, single item), `DELETE /cart/{productId}` (path-based, single item), and `DELETE /cart/all` (clear everything). The tests deliberately use a two-line cart to distinguish "removed one" from "cleared all."
- **404 disambiguation:** A `MISSING_ID` 404 proves the id matched nothing; an `active: false` product 404 proves the SCOPE layer refused a valid id. The code comments call this out explicitly.
- **Shipping-method edge cases:** `null` clears the choice (response field is `undefined`, not `null`); `requiresShipping: false` products trigger 409; a product exceeding the method's weight ceiling (express: 5000 g) also triggers 409.
- **No behavioural assertions beyond shape:** These tests check status codes and minimal field values only. Business-rule correctness (e.g., quantity cap, discount logic) belongs in the service-level suites.
- **`setupTestDb()` is module-level**, not inside a `beforeAll`/`beforeEach`, so the database is provisioned once for the entire file.
