# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose

Contract tests that assert every `/cart` route's response shape matches the declared OpenAPI spec via `toSatisfyApiSpec()`. The cart is a computed view rather than a serialized document, so these tests build state through the API (not fixtures) and verify each declared status-code branch (200, 401, 404, 422) is reachable and well-shaped.

## Key elements

- **`MISSING_ID`** — a well-formed ObjectId guaranteed absent from the DB; distinguishes the 404 "not found" branch from the 422 "invalid id" branch.
- **`authenticateWithCart(quantity?)`** — logs in as `user`, creates a product, adds it to the cart via `POST /cart`, and returns `{ bearer, product }`.
- **`describe` blocks** — one per endpoint (`GET /cart`, `POST /cart`, `DELETE /cart`, `DELETE /cart/all`, `PUT /cart/{productId}`, `DELETE /cart/{productId}`, `GET /cart/summary`, `POST /cart/checkout`). Each contains a success case plus one or more error-contract cases.
- **`toSatisfyApiSpec()`** — the contract matcher (from `@tests/contract`) that validates the full response envelope against the OpenAPI definition.

## Relationships

- **`tests/support/contract.ts`** — provides the `toSatisfyApiSpec()` matcher registered by the side-effect import `import '@tests/contract'`.
- **`tests/support/http.ts`** — provides `api()` (supertest-style client) and `authenticateAs(role)` used in every test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module level to seed an isolated database.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct()` (optionally with `{ active: false }`) supplies real catalogue rows for cart operations.
- **`src/modules/orders/tests/fixtures.ts`** — `createOrder` and `toOrderItem` are imported for the checkout test (file is truncated; usage is in the `POST /cart/checkout` block).
- **`src/modules/users/tests/fixtures.ts`** — `createUser` is imported; likely used in the truncated checkout section.

## Notes

- The doc comment explicitly warns that a hand-written `CartResponse` fixture would assert a shape the app never produces; always go through the API to build state.
- Two distinct 404 cases are tested on `POST /cart` and `PUT /cart/{productId}`: (1) valid id, no matching row → "not found"; (2) valid id, row exists but `active: false` → "outside the public catalogue" (a scope-level refusal). Both return 404 but exercise different code paths.
- `DELETE /cart` (single-item remove) requires a `productId` in the body; omitting it yields 422. The route is aliased (`x-alias-of: removeCartItem`) to distinguish it from `DELETE /cart/all`.
- The file is truncated in the source; the `POST /cart/checkout` test is incomplete here.
- All six+ endpoints share one `CartResponseEnvelope`; the tests exist specifically because a single shared shape is where serialization drift hides.
